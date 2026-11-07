-- =====================================================================
--  PriceScope : Online Retail Product Price Tracking
--  File 01 : SCHEMA  (tables, constraints, indexes)
--  Target  : PostgreSQL 14+   (tested on 18)
--  Team    : E007 Aayush Nayak | E008 Ritwik Shetty | E037 Iram Shaikh
-- =====================================================================
--  Source  : Amazon.com electronics scrape (Aug 2025). One raw CSV row is
--            one product card seen on one search-result page.
--  Model   : normalised to 3NF.  Dimensions (brands, categories, products,
--            snapshots) + one fact table (price_observations) that holds the
--            full price history of every product.
--
--     categories 1--* products *--1 brands
--                       |
--                       1
--                       |
--                       *
--     snapshots  1--* price_observations         products 1--* watchlist
--                                                products 1--* price_events
-- =====================================================================

DROP TABLE IF EXISTS price_events      CASCADE;
DROP TABLE IF EXISTS watchlist         CASCADE;
DROP TABLE IF EXISTS price_observations CASCADE;
DROP TABLE IF EXISTS products          CASCADE;
DROP TABLE IF EXISTS snapshots         CASCADE;
DROP TABLE IF EXISTS brands            CASCADE;
DROP TABLE IF EXISTS categories        CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fast "%text%" search on product titles

-- ---------- dimensions -------------------------------------------------
CREATE TABLE categories (
    category_id  SMALLINT PRIMARY KEY,
    name         VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE brands (
    brand_id     INTEGER PRIMARY KEY,
    name         VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE products (
    product_id   INTEGER PRIMARY KEY,
    asin         VARCHAR(20)  NOT NULL UNIQUE,            -- Amazon Standard Identification Number
    title        TEXT         NOT NULL,
    brand_id     INTEGER      NOT NULL REFERENCES brands(brand_id),
    category_id  SMALLINT     NOT NULL REFERENCES categories(category_id),
    image_url    TEXT,
    page_url     TEXT
);

-- one row per scraping moment; lets us talk about "price on day X"
CREATE TABLE snapshots (
    snapshot_id    INTEGER PRIMARY KEY,
    collected_at   TIMESTAMP NOT NULL UNIQUE,
    snapshot_date  DATE      NOT NULL,
    source         VARCHAR(10) NOT NULL DEFAULT 'scraped'
                   CHECK (source IN ('scraped', 'simulated'))
);

-- ---------- fact table : the price history -----------------------------
CREATE TABLE price_observations (
    obs_id               INTEGER PRIMARY KEY,
    product_id           INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    snapshot_id          INTEGER NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
    current_price        NUMERIC(10,2) CHECK (current_price >= 0),      -- NULL = no price shown
    list_price           NUMERIC(10,2) CHECK (list_price >= 0),         -- "was" price
    discount_pct         NUMERIC(5,2)  CHECK (discount_pct BETWEEN 0 AND 100),
    rating               NUMERIC(2,1)  CHECK (rating BETWEEN 0 AND 5),
    review_count         INTEGER       CHECK (review_count >= 0),
    purchased_last_month INTEGER       CHECK (purchased_last_month >= 0),
    badge                VARCHAR(20)   NOT NULL DEFAULT 'None'
                         CHECK (badge IN ('None','Best Seller','Amazon''s Choice',
                                          'Limited Time Deal','Percent-Off Deal')),
    is_best_seller       BOOLEAN       NOT NULL DEFAULT FALSE,
    is_sponsored         BOOLEAN       NOT NULL DEFAULT FALSE,
    coupon_type          VARCHAR(10)   CHECK (coupon_type IN ('percent','amount')),
    coupon_value         NUMERIC(8,2),
    buy_box_available    BOOLEAN       NOT NULL DEFAULT TRUE,
    delivery_date        DATE,
    sustainability_tag   VARCHAR(60),
    CONSTRAINT uq_product_snapshot UNIQUE (product_id, snapshot_id)
);

-- ---------- user-facing tables (written to by the web app) -------------
CREATE TABLE watchlist (
    watch_id      SERIAL PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    target_price  NUMERIC(10,2) NOT NULL CHECK (target_price > 0),
    is_active     BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- filled automatically by a trigger (see 03_logic.sql)
CREATE TABLE price_events (
    event_id    BIGSERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    obs_id      INTEGER REFERENCES price_observations(obs_id) ON DELETE CASCADE,
    event_type  VARCHAR(12) NOT NULL CHECK (event_type IN ('PRICE_DROP','PRICE_HIKE','TARGET_HIT')),
    old_price   NUMERIC(10,2),
    new_price   NUMERIC(10,2),
    change_pct  NUMERIC(7,2),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- indexes (each one maps to a query pattern in the app) ------
CREATE INDEX ix_products_brand      ON products (brand_id);
CREATE INDEX ix_products_category   ON products (category_id);
CREATE INDEX ix_products_title_trgm ON products USING gin (title gin_trgm_ops);   -- search box
CREATE INDEX ix_obs_product         ON price_observations (product_id, snapshot_id); -- price history
CREATE INDEX ix_obs_snapshot        ON price_observations (snapshot_id);               -- per-day rollups
CREATE INDEX ix_obs_price           ON price_observations (current_price) WHERE current_price IS NOT NULL;
CREATE INDEX ix_snapshots_date      ON snapshots (snapshot_date);
CREATE INDEX ix_events_created      ON price_events (created_at DESC);
CREATE INDEX ix_watch_product       ON watchlist (product_id) WHERE is_active;
