-- =====================================================================
--  File 02 : MATERIALIZED VIEWS  (pre-computed layers the app reads from)
--  Run AFTER the data load.  Refresh with  SELECT fn_refresh_views();
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_price_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_price_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_catalog     CASCADE;

-- ---------------------------------------------------------------------
-- mv_price_daily : the PRICE HISTORY, one row per product per day.
-- A product can be seen many times a day (ads on many result pages), so
-- we collapse to open/low/avg/high/close like a stock chart.
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_price_daily AS
SELECT  o.product_id,
        s.snapshot_date                                              AS day,
        MIN(o.current_price)                                         AS min_price,
        ROUND(AVG(o.current_price), 2)                               AS avg_price,
        MAX(o.current_price)                                         AS max_price,
        (ARRAY_AGG(o.current_price ORDER BY s.collected_at DESC))[1] AS close_price,
        MAX(o.list_price)                                            AS list_price,
        COUNT(*)                                                     AS obs_count
FROM    price_observations o
JOIN    snapshots s USING (snapshot_id)
WHERE   o.current_price IS NOT NULL
GROUP BY o.product_id, s.snapshot_date;

CREATE UNIQUE INDEX ux_mv_price_daily ON mv_price_daily (product_id, day);

-- ---------------------------------------------------------------------
-- mv_price_stats : per-product price statistics over its whole history
-- (window functions pick the first and last daily close).
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_price_stats AS
WITH d AS (
    SELECT  product_id, day, close_price, min_price, max_price,
            FIRST_VALUE(close_price) OVER w AS first_price,
            LAST_VALUE(close_price)  OVER w AS last_price
    FROM    mv_price_daily
    WINDOW  w AS (PARTITION BY product_id ORDER BY day
                  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
)
SELECT  product_id,
        MIN(day)                                   AS first_day,
        MAX(day)                                   AS last_day,
        COUNT(*)                                   AS days_observed,
        MAX(first_price)                           AS first_price,
        MAX(last_price)                            AS last_price,
        MIN(min_price)                             AS min_price,
        MAX(max_price)                             AS max_price,
        ROUND(AVG(close_price), 2)                 AS avg_price,
        ROUND(COALESCE(STDDEV_POP(close_price), 0), 2) AS price_stddev,
        CASE WHEN MAX(first_price) > 0
             THEN ROUND(100.0 * (MAX(last_price) - MAX(first_price)) / MAX(first_price), 2)
        END                                        AS change_pct
FROM    d
GROUP BY product_id;

CREATE UNIQUE INDEX ux_mv_price_stats ON mv_price_stats (product_id);
CREATE INDEX ix_mv_price_stats_chg ON mv_price_stats (change_pct) WHERE days_observed >= 2;

-- ---------------------------------------------------------------------
-- mv_catalog : one flat row per product with its LATEST known state.
-- DISTINCT ON keeps the newest observation that actually carried a price.
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_catalog AS
WITH latest AS (
    SELECT DISTINCT ON (o.product_id)
           o.product_id, s.collected_at AS last_seen,
           o.current_price, o.list_price, o.discount_pct, o.rating, o.review_count,
           o.purchased_last_month, o.badge, o.is_best_seller, o.is_sponsored,
           o.coupon_type, o.coupon_value, o.buy_box_available, o.delivery_date,
           o.sustainability_tag
    FROM   price_observations o
    JOIN   snapshots s USING (snapshot_id)
    ORDER  BY o.product_id, (o.current_price IS NULL), s.collected_at DESC
), activity AS (
    SELECT o.product_id, COUNT(*) AS obs_count,
           MIN(s.collected_at) AS first_seen,
           COUNT(DISTINCT s.snapshot_date) AS days_seen
    FROM   price_observations o JOIN snapshots s USING (snapshot_id)
    GROUP  BY o.product_id
)
SELECT  p.product_id, p.asin, p.title, p.image_url, p.page_url,
        b.brand_id, b.name AS brand, c.category_id, c.name AS category,
        l.last_seen, l.current_price, l.list_price, l.discount_pct, l.rating, l.review_count,
        l.purchased_last_month, l.badge, l.is_best_seller, l.is_sponsored,
        l.coupon_type, l.coupon_value, l.buy_box_available, l.delivery_date, l.sustainability_tag,
        a.obs_count, a.first_seen, a.days_seen
FROM    products p
JOIN    brands b     USING (brand_id)
JOIN    categories c USING (category_id)
JOIN    latest l     USING (product_id)
JOIN    activity a   USING (product_id);

CREATE UNIQUE INDEX ux_mv_catalog_pid    ON mv_catalog (product_id);
CREATE INDEX ix_mv_catalog_category      ON mv_catalog (category_id);
CREATE INDEX ix_mv_catalog_brand         ON mv_catalog (brand_id);
CREATE INDEX ix_mv_catalog_price         ON mv_catalog (current_price);
CREATE INDEX ix_mv_catalog_rating        ON mv_catalog (rating);
CREATE INDEX ix_mv_catalog_title_trgm    ON mv_catalog USING gin (title gin_trgm_ops);

ANALYZE;
