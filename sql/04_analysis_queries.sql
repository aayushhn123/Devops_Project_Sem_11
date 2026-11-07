-- =====================================================================
--  File 04 : ANALYSIS QUERY LIBRARY
--
--  Every query the web app runs lives here (single source of truth) -
--  the UI reads this file, so what you demo is exactly what you submit.
--
--  Annotation format (read by app/queries.py):
--     -- name:        unique id
--     -- title:       heading shown in the UI
--     -- group:       Overview | Price Tracker | Deals | Market | (hidden = used internally)
--     -- concepts:    SQL concepts demonstrated
--     -- description: what question it answers
--     -- params:      name:type=default, ...        (psycopg style %(name)s in the SQL)
--     -- chart:       hbar|bar|line|doughnut x=<column> y=<column>
-- =====================================================================


-- ---------------------------------------------------------------------
-- OVERVIEW
-- ---------------------------------------------------------------------

-- name: kpi_summary
-- title: Dataset at a glance
-- group: hidden
-- concepts: Scalar subqueries, percentile_cont, FILTER
-- description: Headline numbers for the dashboard.
SELECT  (SELECT COUNT(*) FROM products)                                         AS products,
        (SELECT COUNT(*) FROM price_observations)                               AS observations,
        (SELECT COUNT(*) FROM brands WHERE name <> 'Other / Unbranded')         AS brands,
        (SELECT COUNT(*) FROM categories)                                       AS categories,
        (SELECT COUNT(DISTINCT snapshot_date) FROM snapshots WHERE source = 'scraped') AS tracking_days,
        (SELECT MIN(snapshot_date) FROM snapshots WHERE source = 'scraped')     AS first_day,
        (SELECT MAX(snapshot_date) FROM snapshots WHERE source = 'scraped')     AS last_day,
        (SELECT COUNT(*) FROM mv_price_stats WHERE days_observed >= 2
                                              AND max_price > min_price)        AS products_with_price_moves,
        ROUND(AVG(current_price), 2)                                            AS avg_price,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY current_price)::numeric, 2) AS median_price,
        ROUND(AVG(rating), 2)                                                   AS avg_rating,
        ROUND(AVG(discount_pct) FILTER (WHERE discount_pct > 0), 2)             AS avg_discount_on_sale
FROM    mv_catalog;


-- name: category_summary
-- title: Category overview
-- group: Overview
-- concepts: GROUP BY, percentile_cont (median), FILTER
-- description: Size, price level, rating and discount depth of each product category.
-- chart: hbar x=category y=products
SELECT  category,
        COUNT(*)                                                                  AS products,
        ROUND(AVG(current_price), 2)                                              AS avg_price,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY current_price)::numeric, 2) AS median_price,
        MIN(current_price)                                                        AS min_price,
        MAX(current_price)                                                        AS max_price,
        ROUND(AVG(rating), 2)                                                     AS avg_rating,
        COUNT(*) FILTER (WHERE discount_pct > 0)                                  AS on_sale,
        ROUND(AVG(discount_pct) FILTER (WHERE discount_pct > 0), 2)               AS avg_discount_pct
FROM    mv_catalog
WHERE   current_price IS NOT NULL
GROUP BY category
ORDER BY products DESC;


-- name: price_ranges
-- title: Price distribution
-- group: Overview
-- concepts: CASE bucketing, GROUP BY
-- description: How many products fall in each price band?
-- chart: bar x=price_range y=products
SELECT  price_range, COUNT(*) AS products,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct
FROM (
    SELECT CASE WHEN current_price <   25 THEN '1) under $25'
                WHEN current_price <   50 THEN '2) $25 - 50'
                WHEN current_price <  100 THEN '3) $50 - 100'
                WHEN current_price <  250 THEN '4) $100 - 250'
                WHEN current_price <  500 THEN '5) $250 - 500'
                WHEN current_price < 1000 THEN '6) $500 - 1000'
                ELSE                           '7) over $1000' END AS price_range
    FROM mv_catalog WHERE current_price IS NOT NULL
) t
GROUP BY price_range
ORDER BY price_range;


-- name: discount_distribution
-- title: How deep are the discounts?
-- group: Overview
-- concepts: CASE bucketing, window SUM() OVER ()
-- description: Share of products at each discount level (percent off the list "was" price).
-- chart: bar x=discount_band y=products
SELECT  discount_band, COUNT(*) AS products,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct
FROM (
    SELECT CASE WHEN discount_pct = 0  THEN '1) none'
                WHEN discount_pct <  5 THEN '2) under 5 off'
                WHEN discount_pct < 10 THEN '3) 5 - 10 off'
                WHEN discount_pct < 20 THEN '4) 10 - 20 off'
                WHEN discount_pct < 30 THEN '5) 20 - 30 off'
                WHEN discount_pct < 50 THEN '6) 30 - 50 off'
                ELSE                        '7) 50 + off' END AS discount_band
    FROM mv_catalog WHERE discount_pct IS NOT NULL
) t
GROUP BY discount_band
ORDER BY discount_band;


-- name: tracking_coverage
-- title: Scrape coverage by day
-- group: Overview
-- concepts: JOIN, COUNT(DISTINCT), GROUP BY on two keys
-- description: How much price data was collected on each tracking day (the history we can analyse).
-- chart: bar x=day y=observations
SELECT  s.snapshot_date                  AS day,
        s.source,
        COUNT(DISTINCT s.snapshot_id)    AS scrape_pages,
        COUNT(*)                         AS observations,
        COUNT(DISTINCT o.product_id)     AS distinct_products
FROM    price_observations o
JOIN    snapshots s USING (snapshot_id)
GROUP BY s.snapshot_date, s.source
ORDER BY day;


-- name: price_index_trend
-- title: Price index of the tracked basket
-- group: Price Tracker
-- concepts: CTE, FIRST_VALUE, LAG, HAVING
-- description: For products seen on 2+ days, each day's price as % of that product's first price (100 = start). Shows whether the market is getting cheaper or dearer.
-- chart: line x=day y=price_index
WITH basket AS (
    SELECT product_id FROM mv_price_daily GROUP BY product_id HAVING COUNT(*) >= 2
), rebased AS (
    SELECT d.day, d.product_id,
           100.0 * d.close_price / NULLIF(FIRST_VALUE(d.close_price) OVER
                       (PARTITION BY d.product_id ORDER BY d.day), 0) AS idx
    FROM   mv_price_daily d JOIN basket b USING (product_id)
), daily AS (
    SELECT day, COUNT(*) AS products_tracked, ROUND(AVG(idx), 2) AS price_index
    FROM   rebased GROUP BY day
)
SELECT  day, products_tracked, price_index,
        ROUND(price_index - LAG(price_index) OVER (ORDER BY day), 2) AS change_vs_prev_day
FROM    daily
ORDER BY day;


-- ---------------------------------------------------------------------
-- PRICE TRACKER
-- ---------------------------------------------------------------------

-- name: top_price_drops
-- title: Biggest price drops
-- group: Price Tracker
-- concepts: Materialized view JOIN, window functions (first/last), filtering
-- description: Products whose price fell the most between the first and last day we saw them.
-- params: limit:int=25, min_days:int=2
-- chart: hbar x=title y=change_pct
SELECT  c.product_id, c.title, c.brand, c.category, c.image_url,
        st.first_day, st.last_day, st.days_observed,
        st.first_price, st.last_price,
        ROUND(st.last_price - st.first_price, 2) AS change_amount,
        st.change_pct
FROM    mv_price_stats st
JOIN    mv_catalog c USING (product_id)
WHERE   st.days_observed >= %(min_days)s
  AND   st.change_pct < 0
ORDER BY st.change_pct ASC
LIMIT   %(limit)s;


-- name: top_price_hikes
-- title: Biggest price increases
-- group: Price Tracker
-- concepts: Materialized view JOIN, filtering
-- description: Products that got more expensive the most while we watched them.
-- params: limit:int=25, min_days:int=2
-- chart: hbar x=title y=change_pct
SELECT  c.product_id, c.title, c.brand, c.category, c.image_url,
        st.first_day, st.last_day, st.days_observed,
        st.first_price, st.last_price,
        ROUND(st.last_price - st.first_price, 2) AS change_amount,
        st.change_pct
FROM    mv_price_stats st
JOIN    mv_catalog c USING (product_id)
WHERE   st.days_observed >= %(min_days)s
  AND   st.change_pct > 0
ORDER BY st.change_pct DESC
LIMIT   %(limit)s;


-- name: most_volatile
-- title: Most volatile prices
-- group: Price Tracker
-- concepts: Standard deviation, coefficient of variation, NULLIF
-- description: Products whose price swings the most relative to their average price.
-- params: limit:int=25, min_days:int=3
-- chart: hbar x=title y=volatility_pct
SELECT  c.product_id, c.title, c.brand, c.category, c.image_url,
        st.days_observed, st.min_price, st.max_price, st.avg_price, st.price_stddev,
        ROUND(100.0 * st.price_stddev / NULLIF(st.avg_price, 0), 2) AS volatility_pct
FROM    mv_price_stats st
JOIN    mv_catalog c USING (product_id)
WHERE   st.days_observed >= %(min_days)s
  AND   st.max_price > st.min_price
ORDER BY volatility_pct DESC
LIMIT   %(limit)s;


-- name: category_price_moves
-- title: Which categories are getting cheaper?
-- group: Price Tracker
-- concepts: GROUP BY, HAVING, FILTER, aggregate over a materialized view
-- description: Average price change per category, with counts of drops vs hikes.
-- chart: hbar x=category y=avg_change_pct
SELECT  c.category,
        COUNT(*)                                   AS products_tracked,
        COUNT(*) FILTER (WHERE st.change_pct < 0)  AS price_drops,
        COUNT(*) FILTER (WHERE st.change_pct > 0)  AS price_hikes,
        COUNT(*) FILTER (WHERE st.change_pct = 0)  AS unchanged,
        ROUND(AVG(st.change_pct), 2)               AS avg_change_pct
FROM    mv_price_stats st
JOIN    mv_catalog c USING (product_id)
WHERE   st.days_observed >= 2
GROUP BY c.category
HAVING  COUNT(*) >= 5
ORDER BY avg_change_pct;


-- name: recent_price_events
-- title: Live price-event log (written by the trigger)
-- group: Price Tracker
-- concepts: TRIGGER output, JOIN, ORDER BY / LIMIT
-- description: Price drops, hikes and watchlist hits that the database trigger recorded automatically after each new price.
-- params: limit:int=30
SELECT  e.event_id, e.created_at, e.event_type, e.product_id, p.title,
        e.old_price, e.new_price, e.change_pct
FROM    price_events e
JOIN    products p USING (product_id)
ORDER BY e.created_at DESC, e.event_id DESC
LIMIT   %(limit)s;


-- name: price_history
-- title: Price history of one product
-- group: hidden
-- concepts: Materialized view, LAG window function
-- description: Daily open/low/high/close style history for the product chart.
-- params: product_id:int=1
SELECT  day, min_price, avg_price, max_price, close_price, list_price, obs_count,
        ROUND(close_price - LAG(close_price) OVER (ORDER BY day), 2) AS change_vs_prev
FROM    mv_price_daily
WHERE   product_id = %(product_id)s
ORDER BY day;


-- name: product_standing
-- title: Where one product stands in its category
-- group: hidden
-- concepts: PERCENT_RANK, RANK, COUNT() OVER (PARTITION BY ...)
-- description: Price percentile and popularity rank inside the product's category.
-- params: product_id:int=1
SELECT * FROM (
    SELECT  product_id, category,
            ROUND((100 * PERCENT_RANK() OVER (PARTITION BY category_id ORDER BY current_price))::numeric, 1) AS price_percentile,
            RANK() OVER (PARTITION BY category_id ORDER BY review_count DESC NULLS LAST)                      AS popularity_rank,
            COUNT(*) OVER (PARTITION BY category_id)                                                          AS category_size
    FROM    mv_catalog
    WHERE   current_price IS NOT NULL
) t
WHERE product_id = %(product_id)s;


-- name: similar_products
-- title: Similar products
-- group: hidden
-- concepts: Self-join through CTE, ABS() distance ordering
-- description: Products in the same category with the closest price.
-- params: product_id:int=1, limit:int=6
WITH me AS (
    SELECT category_id, current_price FROM mv_catalog WHERE product_id = %(product_id)s
)
SELECT  c.product_id, c.title, c.brand, c.image_url, c.current_price, c.rating,
        c.review_count, c.discount_pct
FROM    mv_catalog c, me
WHERE   c.category_id = me.category_id
  AND   c.product_id <> %(product_id)s
  AND   c.current_price IS NOT NULL
  AND   c.rating IS NOT NULL
  AND   c.review_count >= 50
ORDER BY ABS(c.current_price - me.current_price), c.review_count DESC
LIMIT   %(limit)s;


-- ---------------------------------------------------------------------
-- DEALS
-- ---------------------------------------------------------------------

-- name: best_deals
-- title: Best discounts (quality-filtered)
-- group: Deals
-- concepts: LEFT JOIN, CASE, multi-column filter
-- description: Deepest discounts among products people actually rate well and review a lot - filters out junk listings.
-- params: min_rating:float=4.0, min_reviews:int=100, limit:int=30
-- chart: hbar x=title y=discount_pct
SELECT  c.product_id, c.title, c.brand, c.category, c.image_url,
        c.current_price, c.list_price, c.discount_pct, c.rating, c.review_count,
        st.avg_price,
        CASE WHEN st.days_observed >= 2
             THEN ROUND(100.0 * (c.current_price - st.avg_price) / st.avg_price, 1) END AS vs_own_avg_pct
FROM    mv_catalog c
LEFT JOIN mv_price_stats st USING (product_id)
WHERE   c.discount_pct > 0
  AND   c.current_price IS NOT NULL
  AND   c.rating >= %(min_rating)s
  AND   c.review_count >= %(min_reviews)s
ORDER BY c.discount_pct DESC, c.review_count DESC
LIMIT   %(limit)s;


-- name: below_own_average
-- title: Cheaper than usual
-- group: Deals
-- concepts: Comparing a row with its own aggregate (join to materialized view)
-- description: Products priced below their own average price over the tracking window - a "buy now" signal.
-- params: limit:int=30, min_days:int=2
-- chart: hbar x=title y=vs_avg_pct
SELECT  c.product_id, c.title, c.brand, c.category, c.image_url,
        c.current_price, st.avg_price, st.max_price, st.days_observed,
        ROUND(100.0 * (c.current_price - st.avg_price) / st.avg_price, 1) AS vs_avg_pct
FROM    mv_catalog c
JOIN    mv_price_stats st USING (product_id)
WHERE   st.days_observed >= %(min_days)s
  AND   c.current_price < st.avg_price
ORDER BY vs_avg_pct ASC
LIMIT   %(limit)s;


-- name: coupon_deals
-- title: Coupon savings
-- group: Deals
-- concepts: CTE, CASE expression, derived column ordering
-- description: Products with a clip-on coupon and the price you really pay after applying it.
-- params: limit:int=30
-- chart: hbar x=title y=saving_pct
WITH x AS (
    SELECT  c.*,
            CASE c.coupon_type
                WHEN 'percent' THEN ROUND(c.current_price * (1 - c.coupon_value / 100), 2)
                ELSE GREATEST(ROUND(c.current_price - c.coupon_value, 2), 0)
            END AS price_after_coupon
    FROM    mv_catalog c
    WHERE   c.coupon_type IS NOT NULL AND c.current_price > 0
)
SELECT  product_id, title, brand, category, image_url, current_price, coupon_type, coupon_value,
        price_after_coupon,
        ROUND(100.0 * (current_price - price_after_coupon) / current_price, 1) AS saving_pct,
        rating, review_count
FROM    x
ORDER BY saving_pct DESC, review_count DESC NULLS LAST
LIMIT   %(limit)s;


-- name: best_value_per_category
-- title: Best value in each category
-- group: Deals
-- concepts: NTILE, ROW_NUMBER, nested CTEs, PARTITION BY
-- description: Within each category take the cheapest quartile of well-reviewed products, then pick the top-rated ones.
-- params: per_category:int=3, min_reviews:int=200
SELECT product_id, category, title, brand, image_url, current_price, rating, review_count, category_rank
FROM (
    WITH s AS (
        SELECT  *, NTILE(4) OVER (PARTITION BY category_id ORDER BY current_price) AS price_quartile
        FROM    mv_catalog
        WHERE   current_price IS NOT NULL AND rating IS NOT NULL
          AND   review_count >= %(min_reviews)s
    )
    SELECT  *, ROW_NUMBER() OVER (PARTITION BY category_id
                                  ORDER BY rating DESC, review_count DESC) AS category_rank
    FROM    s
    WHERE   price_quartile = 1
) r
WHERE category_rank <= %(per_category)s
ORDER BY category, category_rank;


-- ---------------------------------------------------------------------
-- MARKET INSIGHTS
-- ---------------------------------------------------------------------

-- name: brand_leaderboard
-- title: Brand leaderboard
-- group: Market
-- concepts: CTE, RANK() OVER, HAVING, aggregate FILTER
-- description: Biggest brands with their price level, rating and discount behaviour, ranked by catalogue size and by rating.
-- params: min_products:int=15, limit:int=20
-- chart: hbar x=brand y=products
WITH b AS (
    SELECT  brand,
            COUNT(*)                                                   AS products,
            ROUND(AVG(current_price), 2)                               AS avg_price,
            ROUND(AVG(rating), 2)                                      AS avg_rating,
            ROUND(AVG(discount_pct) FILTER (WHERE discount_pct > 0), 2) AS avg_discount_pct,
            SUM(review_count)                                          AS total_reviews,
            ROUND(100.0 * AVG(is_sponsored::int), 1)                   AS sponsored_share_pct
    FROM    mv_catalog
    WHERE   brand <> 'Other / Unbranded'
    GROUP BY brand
    HAVING  COUNT(*) >= %(min_products)s
)
SELECT  RANK() OVER (ORDER BY products DESC)            AS size_rank,
        RANK() OVER (ORDER BY avg_rating DESC NULLS LAST) AS rating_rank,
        b.*
FROM    b
ORDER BY size_rank
LIMIT   %(limit)s;


-- name: top_brands_per_category
-- title: Top brands inside each category
-- group: Market
-- concepts: ROW_NUMBER() PARTITION BY, two-level aggregation
-- description: The leading brands (by number of products) in every category.
-- params: top_n:int=3
WITH x AS (
    SELECT  category, brand, COUNT(*) AS products,
            ROUND(AVG(current_price), 2) AS avg_price, ROUND(AVG(rating), 2) AS avg_rating
    FROM    mv_catalog
    WHERE   brand <> 'Other / Unbranded'
    GROUP BY category, brand
), r AS (
    SELECT  *, ROW_NUMBER() OVER (PARTITION BY category
                                  ORDER BY products DESC, avg_rating DESC NULLS LAST) AS brand_rank
    FROM    x
)
SELECT category, brand_rank, brand, products, avg_price, avg_rating
FROM   r
WHERE  brand_rank <= %(top_n)s
ORDER BY category, brand_rank;


-- name: sponsored_vs_organic
-- title: Sponsored vs organic listings
-- group: Market
-- concepts: GROUP BY boolean, FILTER, CASE
-- description: Do advertised listings differ in price, rating or discounting from organic ones?
-- chart: bar x=listing_type y=avg_price
SELECT  CASE WHEN is_sponsored THEN 'Sponsored' ELSE 'Organic' END AS listing_type,
        COUNT(*)                                                    AS products,
        ROUND(AVG(current_price), 2)                                AS avg_price,
        ROUND(AVG(rating), 2)                                       AS avg_rating,
        ROUND(AVG(review_count), 0)                                 AS avg_reviews,
        ROUND(AVG(discount_pct) FILTER (WHERE discount_pct > 0), 2) AS avg_discount_pct,
        ROUND(100.0 * AVG((discount_pct > 0)::int), 1)              AS pct_on_sale
FROM    mv_catalog
WHERE   current_price IS NOT NULL
GROUP BY is_sponsored
ORDER BY listing_type;


-- name: badge_impact
-- title: Do badges sell more?
-- group: Market
-- concepts: GROUP BY, AVG over nullable columns, percentile_cont
-- description: Average demand ("bought last month"), rating and price for each Amazon badge.
-- chart: bar x=badge y=avg_bought_last_month
SELECT  badge,
        COUNT(*)                                             AS products,
        ROUND(AVG(purchased_last_month), 0)                  AS avg_bought_last_month,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY purchased_last_month)::numeric, 0) AS median_bought,
        ROUND(AVG(rating), 2)                                AS avg_rating,
        ROUND(AVG(current_price), 2)                         AS avg_price
FROM    mv_catalog
WHERE   current_price IS NOT NULL
GROUP BY badge
ORDER BY avg_bought_last_month DESC NULLS LAST;


-- name: price_rating_correlation
-- title: Price vs rating vs popularity (correlations)
-- group: Market
-- concepts: CORR() statistical aggregate, LN transform
-- description: Pearson correlation between price, rating, review volume and sales within each category.
-- chart: hbar x=category y=corr_reviews_sales
SELECT  category,
        COUNT(*)                                                                    AS products,
        ROUND(CORR(current_price, rating)::numeric, 3)                              AS corr_price_rating,
        ROUND(CORR(LN(1 + review_count::float8), LN(1 + current_price::float8))::numeric, 3) AS corr_reviews_price,
        ROUND(CORR(LN(1 + review_count::float8), LN(1 + purchased_last_month::float8))::numeric, 3) AS corr_reviews_sales
FROM    mv_catalog
WHERE   current_price > 0 AND rating IS NOT NULL
  AND   review_count IS NOT NULL AND purchased_last_month IS NOT NULL
GROUP BY category
HAVING  COUNT(*) >= 30
ORDER BY category;


-- name: price_percentiles
-- title: Price percentiles by category
-- group: Market
-- concepts: percentile_cont ordered-set aggregate
-- description: p10 / p25 / median / p75 / p90 price of every category - shows the spread, not just the average.
SELECT  category, COUNT(*) AS products,
        ROUND((percentile_cont(0.10) WITHIN GROUP (ORDER BY current_price))::numeric, 2) AS p10,
        ROUND((percentile_cont(0.25) WITHIN GROUP (ORDER BY current_price))::numeric, 2) AS p25,
        ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY current_price))::numeric, 2) AS median,
        ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY current_price))::numeric, 2) AS p75,
        ROUND((percentile_cont(0.90) WITHIN GROUP (ORDER BY current_price))::numeric, 2) AS p90
FROM    mv_catalog
WHERE   current_price IS NOT NULL
GROUP BY category
ORDER BY median DESC;


-- name: category_badge_rollup
-- title: Category x badge with subtotals (ROLLUP)
-- group: Market
-- concepts: GROUP BY ROLLUP, GROUPING()
-- description: Product counts and average price per category and badge, with subtotal and grand-total rows in one query.
SELECT  COALESCE(category, 'ALL CATEGORIES') AS category,
        COALESCE(badge,    'ALL BADGES')     AS badge,
        COUNT(*)                             AS products,
        ROUND(AVG(current_price), 2)         AS avg_price
FROM    mv_catalog
WHERE   current_price IS NOT NULL
GROUP BY ROLLUP (category, badge)
ORDER BY GROUPING(category), category, GROUPING(badge), badge;


-- name: top_selling
-- title: Most-bought products last month
-- group: Market
-- concepts: ORDER BY with NULLS LAST, LIMIT
-- description: Highest "bought in past month" counts - the demand leaders.
-- params: limit:int=25
-- chart: hbar x=title y=purchased_last_month
SELECT  product_id, title, brand, category, image_url, current_price, rating,
        review_count, purchased_last_month
FROM    mv_catalog
WHERE   purchased_last_month IS NOT NULL AND current_price IS NOT NULL
ORDER BY purchased_last_month DESC, review_count DESC NULLS LAST
LIMIT   %(limit)s;


-- name: sustainability_tags
-- title: Sustainability & feature tags
-- group: Market
-- concepts: GROUP BY on nullable column, FILTER
-- description: Amazon's climate / small-business / smart-home tags and how tagged products differ in price.
-- chart: hbar x=tag y=products
SELECT  sustainability_tag AS tag,
        COUNT(*)                     AS products,
        ROUND(AVG(current_price), 2) AS avg_price,
        ROUND(AVG(rating), 2)        AS avg_rating
FROM    mv_catalog
WHERE   sustainability_tag IS NOT NULL AND current_price IS NOT NULL
GROUP BY sustainability_tag
ORDER BY products DESC;


-- name: availability_by_category
-- title: Out-of-stock / no-buy-box rate
-- group: Market
-- concepts: Boolean aggregation, ROUND
-- description: Share of listings in each category that currently have no "Add to cart" button.
-- chart: hbar x=category y=unavailable_pct
SELECT  category,
        COUNT(*)                                                 AS products,
        COUNT(*) FILTER (WHERE NOT buy_box_available)            AS unavailable,
        ROUND(100.0 * AVG((NOT buy_box_available)::int), 1)      AS unavailable_pct
FROM    mv_catalog
GROUP BY category
ORDER BY unavailable_pct DESC;
