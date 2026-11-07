-- =====================================================================
--  File 03 : DATABASE LOGIC  (sequences, stored functions, trigger, view)
--  Run AFTER the data load and 02_views.sql (so the bulk load is not
--  slowed down by the trigger).
-- =====================================================================

-- ---------- sequences continue after the loaded ids --------------------
DROP SEQUENCE IF EXISTS seq_snapshot_id;
DROP SEQUENCE IF EXISTS seq_obs_id;
CREATE SEQUENCE seq_snapshot_id;
CREATE SEQUENCE seq_obs_id;
SELECT setval('seq_snapshot_id', (SELECT COALESCE(MAX(snapshot_id), 1) FROM snapshots));
SELECT setval('seq_obs_id',      (SELECT COALESCE(MAX(obs_id), 1)      FROM price_observations));

-- ---------- refresh helper ---------------------------------------------
CREATE OR REPLACE FUNCTION fn_refresh_views() RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW mv_price_daily;     -- order matters: stats reads daily
    REFRESH MATERIALIZED VIEW mv_price_stats;
    REFRESH MATERIALIZED VIEW mv_catalog;
END $$;

-- ---------- TRIGGER: log every price change + watchlist hits -----------
-- Fires after each new observation. Compares with the product's previous
-- priced observation and writes a row into price_events.
CREATE OR REPLACE FUNCTION trg_log_price_event() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_prev NUMERIC;
    v_chg  NUMERIC;
BEGIN
    IF NEW.current_price IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT o.current_price INTO v_prev
    FROM   price_observations o
    JOIN   snapshots s USING (snapshot_id)
    WHERE  o.product_id = NEW.product_id
      AND  o.obs_id <> NEW.obs_id
      AND  o.current_price IS NOT NULL
    ORDER  BY s.collected_at DESC
    LIMIT  1;

    IF v_prev IS NOT NULL AND v_prev <> NEW.current_price THEN
        v_chg := ROUND(100.0 * (NEW.current_price - v_prev) / v_prev, 2);
        INSERT INTO price_events (product_id, obs_id, event_type, old_price, new_price, change_pct)
        VALUES (NEW.product_id, NEW.obs_id,
                CASE WHEN v_chg < 0 THEN 'PRICE_DROP' ELSE 'PRICE_HIKE' END,
                v_prev, NEW.current_price, v_chg);
    END IF;

    INSERT INTO price_events (product_id, obs_id, event_type, old_price, new_price, change_pct)
    SELECT NEW.product_id, NEW.obs_id, 'TARGET_HIT', w.target_price, NEW.current_price,
           ROUND(100.0 * (NEW.current_price - w.target_price) / w.target_price, 2)
    FROM   watchlist w
    WHERE  w.product_id = NEW.product_id
      AND  w.is_active
      AND  NEW.current_price <= w.target_price;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_price_event ON price_observations;
CREATE TRIGGER trg_price_event
AFTER INSERT ON price_observations
FOR EACH ROW EXECUTE FUNCTION trg_log_price_event();

-- ---------- FUNCTION: record a new price for a product -----------------
-- Clones the product's latest observation (rating, badge, ...) with a new
-- price and stores it as a 'simulated' snapshot on the day after the last
-- scraped day.  The trigger above does the rest.
CREATE OR REPLACE FUNCTION fn_record_price(p_product_id INT, p_new_price NUMERIC)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_prev  price_observations%ROWTYPE;
    v_snap  INT;
    v_obs   INT;
    v_day   DATE;
    v_list  NUMERIC;
BEGIN
    IF p_new_price IS NULL OR p_new_price <= 0 THEN
        RAISE EXCEPTION 'Price must be a positive number';
    END IF;

    SELECT o.* INTO v_prev
    FROM   price_observations o JOIN snapshots s USING (snapshot_id)
    WHERE  o.product_id = p_product_id
    ORDER  BY (o.current_price IS NULL), s.collected_at DESC
    LIMIT  1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown product id %', p_product_id;
    END IF;

    SELECT MAX(snapshot_date) + 1 INTO v_day FROM snapshots WHERE source = 'scraped';
    v_snap := nextval('seq_snapshot_id');
    INSERT INTO snapshots (snapshot_id, collected_at, snapshot_date, source)
    VALUES (v_snap, v_day + clock_timestamp()::time, v_day, 'simulated');

    v_list := GREATEST(COALESCE(v_prev.list_price, p_new_price), p_new_price);
    v_obs  := nextval('seq_obs_id');
    INSERT INTO price_observations
           (obs_id, product_id, snapshot_id, current_price, list_price, discount_pct, rating,
            review_count, purchased_last_month, badge, is_best_seller, is_sponsored,
            coupon_type, coupon_value, buy_box_available, delivery_date, sustainability_tag)
    VALUES (v_obs, p_product_id, v_snap, p_new_price, v_list,
            ROUND(100.0 * (v_list - p_new_price) / v_list, 2), v_prev.rating,
            v_prev.review_count, v_prev.purchased_last_month, v_prev.badge, v_prev.is_best_seller,
            v_prev.is_sponsored, v_prev.coupon_type, v_prev.coupon_value, TRUE,
            v_prev.delivery_date, v_prev.sustainability_tag);
    RETURN v_obs;
END $$;

-- ---------- FUNCTION: simulate a market day ----------------------------
-- Moves the price of p_n random products by a random -p_max_drop..+p_max_hike %.
CREATE OR REPLACE FUNCTION fn_simulate_market(p_n INT DEFAULT 100,
                                              p_max_drop NUMERIC DEFAULT 25,
                                              p_max_hike NUMERIC DEFAULT 10)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    r       RECORD;
    v_count INT := 0;
    v_pct   NUMERIC;
BEGIN
    FOR r IN SELECT product_id, current_price
             FROM   mv_catalog
             WHERE  current_price >= 5
             ORDER  BY random()
             LIMIT  LEAST(GREATEST(p_n, 1), 2000)
    LOOP
        v_pct := -p_max_drop + random() * (p_max_drop + p_max_hike);
        PERFORM fn_record_price(r.product_id, GREATEST(ROUND(r.current_price * (1 + v_pct / 100), 2), 1));
        v_count := v_count + 1;
    END LOOP;
    PERFORM fn_refresh_views();
    RETURN v_count;
END $$;

-- ---------- FUNCTION: undo all simulations -----------------------------
CREATE OR REPLACE FUNCTION fn_reset_simulation() RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE v_deleted INT;
BEGIN
    DELETE FROM snapshots WHERE source = 'simulated';      -- cascades to observations + events
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    PERFORM fn_refresh_views();
    RETURN v_deleted;
END $$;

-- ---------- ACCESS CONTROL: read-only role used by the SQL Lab ---------
-- The web "SQL Lab" runs user-typed queries as this role (SET LOCAL ROLE),
-- so it can only SELECT - never modify data or touch the server.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pt_readonly') THEN
        CREATE ROLE pt_readonly NOLOGIN;
    END IF;
END $$;

-- ---------- VIEW: watchlist with live comparison to the target ---------
CREATE OR REPLACE VIEW v_watchlist AS
SELECT  w.watch_id, w.product_id, c.asin, c.title, c.image_url, c.brand, c.category,
        w.target_price, c.current_price,
        ROUND(c.current_price - w.target_price, 2)                              AS gap,
        ROUND(100.0 * (c.current_price - w.target_price) / w.target_price, 1)  AS gap_pct,
        (c.current_price <= w.target_price)                                    AS target_reached,
        st.min_price AS lowest_seen, st.max_price AS highest_seen,
        w.is_active, w.created_at
FROM    watchlist w
JOIN    mv_catalog c USING (product_id)
LEFT JOIN mv_price_stats st USING (product_id);

GRANT USAGE ON SCHEMA public TO pt_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pt_readonly;   -- tables, views, materialized views
