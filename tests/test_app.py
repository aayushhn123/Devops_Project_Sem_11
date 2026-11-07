"""Integration tests: the real Flask app against a real, loaded PostgreSQL."""
import pytest

import devops
import server


def test_kpis_match_the_loaded_data(client):
    k = client.get("/api/kpis").get_json()["kpis"]
    assert k["products"] == 8817
    assert k["observations"] == 42673


@pytest.mark.parametrize("name", sorted(q for q in server.QUERIES if server.QUERIES[q]["group"] != "hidden"))
def test_every_analysis_query_runs(client, name):
    params = {"product_id": 1} if any(p["name"] == "product_id" for p in server.QUERIES[name]["params"]) else {}
    assert client.get(f"/api/query/{name}", query_string=params).status_code == 200


def test_product_search_filters_results(client):
    body = client.get("/api/products", query_string={"q": "airpods", "page_size": 5}).get_json()
    assert body["total"] > 0
    assert all("airpods" in p["title"].lower() for p in body["items"])


def test_sql_lab_runs_a_select(client):
    assert client.post("/api/sql", json={"sql": "SELECT 1 AS x"}).get_json()["rows"] == [[1]]


@pytest.mark.parametrize("sql", ["DELETE FROM products", "SELECT 1; DROP TABLE products", "DROP TABLE products"])
def test_sql_lab_rejects_writes(client, sql):
    assert client.post("/api/sql", json={"sql": sql}).status_code == 400


def test_sql_lab_role_cannot_write_through_a_cte(client):
    r = client.post("/api/sql", json={"sql": "WITH d AS (DELETE FROM watchlist RETURNING 1) SELECT * FROM d"})
    assert r.status_code == 400


def test_trigger_logs_a_price_drop(client):
    pid = client.get("/api/products", query_string={"page_size": 1}).get_json()["items"][0]
    try:
        r = client.post("/api/simulate/price", json={"product_id": pid["product_id"],
                                                     "price": round(float(pid["current_price"]) * 0.5, 2)})
        assert "PRICE_DROP" in [e["event_type"] for e in r.get_json()["events"]]
    finally:
        client.post("/api/simulate/reset")


def test_health_endpoints(client):
    assert client.get("/healthz").get_json() == {"status": "ok"}
    assert client.get("/readyz").get_json() == {"status": "ready"}


def test_metrics_endpoint_counts_requests(client):
    client.get("/healthz")
    text = client.get("/metrics").get_data(as_text=True)
    assert 'pricescope_http_requests_total{endpoint="healthz",method="GET",status="200"}' in text


def test_devops_status_reports_database(client):
    body = client.get("/api/devops/status").get_json()
    assert body["db"]["ok"] is True
    assert body["version"]


def test_shutdown_needs_confirmation_header(client, monkeypatch):
    called = []
    monkeypatch.setattr(devops, "_stop_process", lambda *_: called.append(True))
    assert client.post("/api/admin/shutdown").status_code == 400
    assert not called


def test_shutdown_can_be_disabled(client, monkeypatch):
    monkeypatch.setenv("ALLOW_SHUTDOWN", "false")
    r = client.post("/api/admin/shutdown", headers={"X-PriceScope-Action": "shutdown"})
    assert r.status_code == 403
