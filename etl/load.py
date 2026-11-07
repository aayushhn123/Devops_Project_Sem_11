"""
ETL step 2 - LOAD the cleaned CSVs into PostgreSQL and build the database objects.

    python etl/load.py              rebuilds everything
    python etl/load.py --if-empty   does nothing if already loaded (used by containers)

Reads connection settings from .env (see .env.example). Creates the database
if it does not exist, then runs:
    sql/01_schema.sql   tables, constraints, indexes
    COPY data/clean/*.csv   bulk load (fast: ~40k rows in a second or two)
    sql/02_views.sql    materialized views
    sql/03_logic.sql    functions, trigger, watchlist view
"""
import sys
import time
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
from config import conninfo, DB_NAME  # noqa: E402

CLEAN = ROOT / "data" / "clean"
SQL = ROOT / "sql"

LOAD_ORDER = [  # parents before children (foreign keys)
    ("categories",   "category_id, name"),
    ("brands",       "brand_id, name"),
    ("products",     "product_id, asin, title, brand_id, category_id, image_url, page_url"),
    ("snapshots",    "snapshot_id, collected_at, snapshot_date"),
    ("price_observations",
     "obs_id, product_id, snapshot_id, current_price, list_price, discount_pct, rating, review_count, "
     "purchased_last_month, badge, is_best_seller, is_sponsored, coupon_type, coupon_value, "
     "buy_box_available, delivery_date, sustainability_tag"),
]
CSV_FOR = {"price_observations": "observations"}


def ensure_database():
    with psycopg.connect(conninfo("postgres"), autocommit=True) as admin:
        exists = admin.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,)).fetchone()
        if not exists:
            admin.execute(f'CREATE DATABASE "{DB_NAME}"')
            print(f"Created database {DB_NAME}")
        else:
            print(f"Database {DB_NAME} already exists")


def run_sql_file(conn, name):
    t = time.time()
    conn.execute((SQL / name).read_text(encoding="utf-8"))
    conn.commit()
    print(f"  ran {name:<14} {time.time() - t:5.1f}s")


def main():
    for t, _ in LOAD_ORDER:
        f = CLEAN / f"{CSV_FOR.get(t, t)}.csv"
        if not f.exists():
            sys.exit(f"Missing {f} - run  python etl/clean.py  first")
    ensure_database()
    with psycopg.connect(conninfo(DB_NAME)) as conn:
        # v_watchlist comes from the last SQL file, so it only exists after a complete load.
        if "--if-empty" in sys.argv and conn.execute("SELECT to_regclass('public.v_watchlist')").fetchone()[0]:
            print("Database already loaded, nothing to do.")
            return
        run_sql_file(conn, "01_schema.sql")
        for table, cols in LOAD_ORDER:
            f = CLEAN / f"{CSV_FOR.get(table, table)}.csv"
            t = time.time()
            with conn.cursor() as cur:
                with cur.copy(f"COPY {table} ({cols}) FROM STDIN WITH (FORMAT csv, HEADER true)") as cp:
                    with open(f, "rb") as fh:
                        while chunk := fh.read(1 << 20):
                            cp.write(chunk)
            conn.commit()
            n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  loaded {table:<20} {n:>7,} rows  {time.time() - t:5.1f}s")
        run_sql_file(conn, "02_views.sql")
        run_sql_file(conn, "03_logic.sql")

        print("\nSanity checks")
        for label, q in [
            ("products in catalog view", "SELECT COUNT(*) FROM mv_catalog"),
            ("product-days of history", "SELECT COUNT(*) FROM mv_price_daily"),
            ("products with >=2 days",   "SELECT COUNT(*) FROM mv_price_stats WHERE days_observed >= 2"),
            ("orphan observations",      "SELECT COUNT(*) FROM price_observations o "
                                         "LEFT JOIN products p USING (product_id) WHERE p.product_id IS NULL"),
        ]:
            print(f"  {label:<28} {conn.execute(q).fetchone()[0]:,}")
    print("\nDone. Start the app with:  python app/server.py")


if __name__ == "__main__":
    main()
