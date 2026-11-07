"""
Flask backend for the Price Tracker UI.

Every button in the web app calls one of the /api endpoints below, which runs
SQL against PostgreSQL and returns JSON (plus the SQL text itself so the UI
can show "what query just ran").
"""
import re
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg
from flask import Flask, jsonify, request, send_from_directory
from flask.json.provider import DefaultJSONProvider
from psycopg.rows import dict_row, tuple_row
from psycopg_pool import ConnectionPool

import devops
from config import conninfo
from queries import coerce_params, load_queries

STATIC = Path(__file__).resolve().parent / "static"


class Provider(DefaultJSONProvider):
    @staticmethod
    def default(o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (date, datetime)):
            return o.isoformat(sep=" ") if isinstance(o, datetime) else o.isoformat()
        return DefaultJSONProvider.default(o)


app = Flask(__name__, static_folder=str(STATIC), static_url_path="")
app.json = Provider(app)
QUERIES = load_queries()
pool = ConnectionPool(conninfo(), min_size=1, max_size=8, kwargs={"row_factory": dict_row},
                      open=False, timeout=10)
pool.open()                            # gunicorn imports this module; connections retry in the background
devops.register(app, pool)


def rows_of(cur):
    return [dict(r) for r in cur.fetchall()]


def run_named(name: str, raw_params: dict | None = None):
    q = QUERIES[name]
    params = coerce_params(q, raw_params or {})
    t = time.perf_counter()
    with pool.connection() as conn:
        rows = rows_of(conn.execute(q["sql"], params))
    return q, params, rows, round((time.perf_counter() - t) * 1000, 1)


@app.errorhandler(psycopg.Error)
def db_error(e):
    app.logger.exception("database error")
    return jsonify(error=str(e).splitlines()[0]), 400


@app.errorhandler(ValueError)
def value_error(e):
    return jsonify(error=str(e)), 400


# ---------------------------------------------------------------- pages
@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


# ---------------------------------------------------------------- meta
@app.get("/api/meta")
def meta():
    with pool.connection() as conn:
        categories = rows_of(conn.execute(
            "SELECT category_id AS id, category AS name, COUNT(*) AS n FROM mv_catalog "
            "GROUP BY category_id, category ORDER BY category"))
        brands = rows_of(conn.execute(
            "SELECT brand_id AS id, brand AS name, COUNT(*) AS n FROM mv_catalog "
            "GROUP BY brand_id, brand HAVING COUNT(*) >= 5 ORDER BY COUNT(*) DESC, brand"))
        badges = rows_of(conn.execute(
            "SELECT badge AS name, COUNT(*) AS n FROM mv_catalog GROUP BY badge ORDER BY n DESC"))
        price = conn.execute("SELECT MIN(current_price) AS lo, MAX(current_price) AS hi FROM mv_catalog").fetchone()
        version = conn.execute("SELECT split_part(current_setting('server_version'), ' ', 1) AS v").fetchone()["v"]
    return jsonify(categories=categories, brands=brands, badges=badges, price=price, version=version)


@app.get("/api/kpis")
def kpis():
    q, _, rows, ms = run_named("kpi_summary")
    return jsonify(kpis=rows[0], sql=q["sql"], ms=ms)


@app.get("/api/queries")
def query_catalog():
    return jsonify([{k: v for k, v in q.items() if k != "sql"} for q in QUERIES.values()
                    if q["group"] != "hidden"])


@app.get("/api/querysql/<name>")
def query_sql(name):
    if name not in QUERIES:
        return jsonify(error="unknown query"), 404
    return jsonify(QUERIES[name])


@app.get("/api/query/<name>")
def run_query(name):
    if name not in QUERIES:
        return jsonify(error="unknown query"), 404
    q, params, rows, ms = run_named(name, request.args.to_dict())
    cols = list(rows[0].keys()) if rows else []
    return jsonify(name=name, title=q["title"], description=q["description"], concepts=q["concepts"],
                   chart=q["chart"], params=params, columns=cols, rows=rows, rowcount=len(rows),
                   sql=q["sql"], ms=ms)


# ---------------------------------------------------------------- product explorer
SORTS = {
    "popular":    "c.review_count DESC NULLS LAST",
    "price_asc":  "c.current_price ASC NULLS LAST",
    "price_desc": "c.current_price DESC NULLS LAST",
    "discount":   "c.discount_pct DESC NULLS LAST, c.review_count DESC NULLS LAST",
    "rating":     "c.rating DESC NULLS LAST, c.review_count DESC NULLS LAST",
    "drop":       "st.change_pct ASC NULLS LAST",
    "sales":      "c.purchased_last_month DESC NULLS LAST",
    "volatile":   "(st.max_price - st.min_price) / NULLIF(st.avg_price, 0) DESC NULLS LAST",
}


@app.get("/api/products")
def products():
    a = request.args
    where, params = ["1=1"], []

    def num(key, cast=float):
        v = a.get(key)
        try:
            return cast(v) if v not in (None, "") else None
        except ValueError:
            raise ValueError(f"bad value for {key}")

    for term in (a.get("q") or "").split()[:6]:
        where.append("c.title ILIKE %s")
        params.append(f"%{term}%")
    if (v := num("category", int)) is not None:
        where.append("c.category_id = %s"); params.append(v)
    if (v := num("brand", int)) is not None:
        where.append("c.brand_id = %s"); params.append(v)
    if (v := num("min_price")) is not None:
        where.append("c.current_price >= %s"); params.append(v)
    if (v := num("max_price")) is not None:
        where.append("c.current_price <= %s"); params.append(v)
    if (v := num("min_rating")) is not None:
        where.append("c.rating >= %s"); params.append(v)
    if (v := num("min_discount")) is not None:
        where.append("c.discount_pct >= %s"); params.append(v)
    if a.get("badge"):
        where.append("c.badge = %s"); params.append(a["badge"])
    if a.get("sponsored") in ("yes", "no"):
        where.append("c.is_sponsored = %s"); params.append(a["sponsored"] == "yes")
    if a.get("coupon") == "yes":
        where.append("c.coupon_type IS NOT NULL")
    if a.get("in_stock") == "yes":
        where.append("c.buy_box_available")
    if a.get("tracked") == "yes":          # has a real multi-day price history
        where.append("st.days_observed >= 2")
    if a.get("moved") == "yes":            # price actually changed while tracked
        where.append("st.days_observed >= 2 AND st.max_price > st.min_price")
    where.append("c.current_price IS NOT NULL")

    order = SORTS.get(a.get("sort", "popular"), SORTS["popular"])
    page = max(num("page", int) or 1, 1)
    size = min(max(num("page_size", int) or 24, 1), 100)

    sql = f"""SELECT c.product_id, c.title, c.brand, c.category, c.image_url, c.current_price,
       c.list_price, c.discount_pct, c.rating, c.review_count, c.purchased_last_month, c.badge,
       c.is_sponsored, c.coupon_type, c.coupon_value, c.buy_box_available, c.days_seen,
       st.change_pct, st.min_price, st.max_price, st.days_observed,
       COUNT(*) OVER () AS total_count
FROM   mv_catalog c
LEFT JOIN mv_price_stats st USING (product_id)
WHERE  {' AND '.join(where)}
ORDER BY {order}, c.product_id
LIMIT  {size} OFFSET {(page - 1) * size}"""
    t = time.perf_counter()
    with pool.connection() as conn:
        rows = rows_of(conn.execute(sql, params))
    total = rows[0]["total_count"] if rows else 0
    for r in rows:
        r.pop("total_count")
    shown = sql
    for p in params:                       # human-readable SQL for the "View SQL" panel
        shown = shown.replace("%s", repr(p) if isinstance(p, str) else str(p), 1)
    return jsonify(items=rows, total=total, page=page, page_size=size,
                   sql=shown, ms=round((time.perf_counter() - t) * 1000, 1))


@app.get("/api/product/<int:pid>")
def product(pid):
    with pool.connection() as conn:
        base = conn.execute("""SELECT c.*, st.first_day, st.last_day, st.days_observed, st.first_price,
                                      st.last_price, st.min_price, st.max_price, st.avg_price,
                                      st.price_stddev, st.change_pct
                               FROM mv_catalog c LEFT JOIN mv_price_stats st USING (product_id)
                               WHERE c.product_id = %s""", (pid,)).fetchone()
        if not base:
            return jsonify(error="product not found"), 404
        watch = rows_of(conn.execute(
            "SELECT watch_id, target_price FROM watchlist WHERE product_id = %s AND is_active", (pid,)))
        events = rows_of(conn.execute(
            "SELECT created_at, event_type, old_price, new_price, change_pct FROM price_events "
            "WHERE product_id = %s ORDER BY created_at DESC LIMIT 10", (pid,)))
    _, _, history, _ = run_named("price_history", {"product_id": pid})
    _, _, standing, _ = run_named("product_standing", {"product_id": pid})
    _, _, similar, _ = run_named("similar_products", {"product_id": pid})
    base = dict(base)
    return jsonify(product=base, history=history, standing=standing[0] if standing else None,
                   similar=similar, watch=watch, events=events,
                   sql={"history": QUERIES["price_history"]["sql"],
                        "standing": QUERIES["product_standing"]["sql"],
                        "similar": QUERIES["similar_products"]["sql"]})


@app.get("/api/suggest")
def suggest():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify([])
    with pool.connection() as conn:
        rows = rows_of(conn.execute(
            "SELECT product_id, title, brand, current_price, image_url FROM mv_catalog "
            "WHERE title ILIKE %s AND current_price IS NOT NULL "
            "ORDER BY review_count DESC NULLS LAST LIMIT 8", (f"%{q}%",)))
    return jsonify(rows)


# ---------------------------------------------------------------- watchlist & simulation
@app.get("/api/watchlist")
def watchlist():
    with pool.connection() as conn:
        rows = rows_of(conn.execute("SELECT * FROM v_watchlist WHERE is_active ORDER BY target_reached DESC, created_at DESC"))
    return jsonify(items=rows, sql="SELECT * FROM v_watchlist WHERE is_active\nORDER BY target_reached DESC, created_at DESC")


@app.post("/api/watchlist")
def watchlist_add():
    d = request.get_json(force=True)
    pid, target = int(d["product_id"]), float(d["target_price"])
    if target <= 0:
        raise ValueError("Target price must be positive")
    with pool.connection() as conn:
        row = conn.execute("INSERT INTO watchlist (product_id, target_price) VALUES (%s, %s) RETURNING watch_id",
                           (pid, target)).fetchone()
    return jsonify(watch_id=row["watch_id"])


@app.delete("/api/watchlist/<int:wid>")
def watchlist_del(wid):
    with pool.connection() as conn:
        conn.execute("DELETE FROM watchlist WHERE watch_id = %s", (wid,))
    return jsonify(ok=True)


@app.post("/api/simulate/price")
def sim_price():
    d = request.get_json(force=True)
    pid, price = int(d["product_id"]), float(d["price"])
    with pool.connection() as conn:
        conn.execute("SELECT fn_record_price(%s::int, %s::numeric)", (pid, price))
        conn.execute("SELECT fn_refresh_views()")
        events = rows_of(conn.execute(
            "SELECT event_type, old_price, new_price, change_pct FROM price_events "
            "WHERE product_id = %s ORDER BY event_id DESC LIMIT 3", (pid,)))
    return jsonify(events=events)


@app.post("/api/simulate/market")
def sim_market():
    n = int((request.get_json(silent=True) or {}).get("n", 100))
    with pool.connection() as conn:
        k = conn.execute("SELECT fn_simulate_market(%s::int) AS n", (n,)).fetchone()["n"]
    return jsonify(updated=k)


@app.post("/api/simulate/reset")
def sim_reset():
    with pool.connection() as conn:
        k = conn.execute("SELECT fn_reset_simulation() AS n").fetchone()["n"]
    return jsonify(removed=k)


# ---------------------------------------------------------------- schema browser + SQL lab
@app.get("/api/schema")
def schema():
    with pool.connection() as conn:
        cols = rows_of(conn.execute("""
            SELECT c.relname AS table_name,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'm' THEN 'materialized view' ELSE 'view' END AS kind,
                   a.attname AS column_name,
                   pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                   a.attnum,
                   COALESCE(c.reltuples, 0)::bigint AS approx_rows
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            WHERE c.relkind IN ('r', 'm', 'v')
            ORDER BY c.relkind, c.relname, a.attnum"""))
        pks = {(r["table_name"], r["column_name"]) for r in conn.execute("""
            SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'""")}
        fks = {(r["table_name"], r["column_name"]): r["ref"] for r in conn.execute("""
            SELECT kcu.table_name, kcu.column_name, ccu.table_name || '.' || ccu.column_name AS ref
            FROM information_schema.referential_constraints rc
            JOIN information_schema.key_column_usage kcu USING (constraint_name, constraint_schema)
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
            WHERE kcu.table_schema = 'public'""")}
        funcs = rows_of(conn.execute("""
            SELECT p.proname AS name, pg_get_function_arguments(p.oid) AS args,
                   CASE WHEN p.prorettype = 'trigger'::regtype THEN 'trigger function' ELSE 'function' END AS kind
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
            WHERE p.proname LIKE 'fn\\_%' OR p.proname LIKE 'trg\\_%' ORDER BY p.proname"""))
    tables = {}
    for r in cols:
        t = tables.setdefault(r["table_name"], {"name": r["table_name"], "kind": r["kind"],
                                                "rows": r["approx_rows"], "columns": []})
        key = (r["table_name"], r["column_name"])
        t["columns"].append({"name": r["column_name"], "type": r["data_type"],
                             "pk": key in pks, "fk": fks.get(key)})
    return jsonify(tables=list(tables.values()), functions=funcs)


_FORBIDDEN_START = re.compile(r"^\s*(select|with|explain|table|values)\b", re.I)


@app.post("/api/sql")
def sql_lab():
    d = request.get_json(force=True)
    sql = re.sub(r"(?m)^\s*--.*$", "", d.get("sql") or "")        # drop full-line comments
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise ValueError("Type a query first")
    if ";" in sql:
        raise ValueError("Only one statement at a time please")
    if not _FORBIDDEN_START.match(sql):
        raise ValueError("SQL Lab is read-only: start with SELECT, WITH, EXPLAIN, TABLE or VALUES")
    if d.get("explain") and not re.match(r"^\s*explain\b", sql, re.I):
        sql = "EXPLAIN (ANALYZE, BUFFERS) " + sql
    t = time.perf_counter()
    with pool.connection() as conn:
        with conn.transaction():
            conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout = '8s'")
            conn.execute("SET LOCAL ROLE pt_readonly")
            cur = conn.cursor(row_factory=tuple_row)    # tuples: duplicate column names are fine
            cur.execute(sql)
            cols = [c.name for c in cur.description] if cur.description else []
            rows = [list(r) for r in cur.fetchmany(1001)]
    truncated = len(rows) > 1000
    return jsonify(columns=cols, rows=rows[:1000], rowcount=min(len(rows), 1000), truncated=truncated,
                   ms=round((time.perf_counter() - t) * 1000, 1))


if __name__ == "__main__":
    pool.wait()
    print("\n  Price Tracker running ->  http://localhost:5000\n")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
