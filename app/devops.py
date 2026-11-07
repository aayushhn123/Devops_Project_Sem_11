"""DevOps endpoints: health probes, Prometheus metrics, live status and shutdown."""
import json
import os
import signal
import socket
import ssl
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

SA_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")
DEPLOYMENT = "pricescope-app"
STARTED = time.time()

REQUESTS = Counter("pricescope_http_requests_total", "HTTP requests served", ["method", "endpoint", "status"])
LATENCY = Histogram("pricescope_http_request_seconds", "HTTP request duration", ["endpoint"])


def environment() -> str:
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        return "Kubernetes"
    return os.environ.get("DEPLOY_ENV", "Local")


def namespace() -> str | None:
    return os.environ.get("POD_NAMESPACE")


def shutdown_allowed() -> bool:
    return os.environ.get("ALLOW_SHUTDOWN", "true").lower() == "true"


def restart_hint() -> str:
    return {
        "Kubernetes": f"kubectl scale deployment {DEPLOYMENT} -n {namespace()} --replicas=2",
        "Docker Compose": "docker compose up -d app",
    }.get(environment(), "python app/server.py")


def k8s_api(path: str, method: str = "GET", body: dict | None = None) -> dict:
    """Call the Kubernetes API using this pod's service-account token."""
    url = f"https://{os.environ['KUBERNETES_SERVICE_HOST']}:{os.environ['KUBERNETES_SERVICE_PORT']}{path}"
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None, headers={
        "Authorization": f"Bearer {(SA_DIR / 'token').read_text()}",
        "Content-Type": "application/merge-patch+json",
    })
    ctx = ssl.create_default_context(cafile=str(SA_DIR / "ca.crt"))
    with urllib.request.urlopen(req, context=ctx, timeout=3) as r:
        return json.load(r)


def list_pods() -> list[dict] | None:
    if environment() != "Kubernetes":
        return None
    pods = []
    for p in k8s_api(f"/api/v1/namespaces/{namespace()}/pods")["items"]:
        statuses = p["status"].get("containerStatuses", [])
        started = datetime.fromisoformat(p["status"].get("startTime", p["metadata"]["creationTimestamp"]))
        pods.append({
            "name": p["metadata"]["name"],
            "component": p["metadata"].get("labels", {}).get("app", ""),
            "phase": "Terminating" if p["metadata"].get("deletionTimestamp") else p["status"]["phase"],
            "ready": sum(c["ready"] for c in statuses),
            "containers": len(p["spec"]["containers"]),
            "restarts": sum(c["restartCount"] for c in statuses),
            "age_s": int((datetime.now(timezone.utc) - started).total_seconds()),
            "image": p["spec"]["containers"][0]["image"],
        })
    return sorted(pods, key=lambda x: (x["component"], x["name"]))


def _stop_process(under_gunicorn: bool) -> None:
    # A worker must signal the gunicorn master, or the master just starts a new worker.
    os.kill(os.getppid() if under_gunicorn else os.getpid(), signal.SIGTERM)


def _request_totals() -> dict:
    total = errors = 0
    for metric in REQUESTS.collect():
        for s in metric.samples:
            if s.name.endswith("_total"):
                total += s.value
                errors += s.value if s.labels["status"].startswith("5") else 0
    return {"requests": int(total), "server_errors": int(errors)}


def register(app: Flask, pool) -> None:
    @app.before_request
    def _start_timer():
        g.started = time.perf_counter()

    @app.after_request
    def _record(resp):
        endpoint = request.endpoint or "unmatched"
        REQUESTS.labels(request.method, endpoint, resp.status_code).inc()
        LATENCY.labels(endpoint).observe(time.perf_counter() - g.get("started", time.perf_counter()))
        return resp

    @app.get("/healthz")
    def healthz():
        """Liveness: the process is up. Never touches the database."""
        return jsonify(status="ok")

    @app.get("/readyz")
    def readyz():
        """Readiness: only send traffic here once the database and its data are usable."""
        try:
            with pool.connection(timeout=2) as conn:
                conn.execute("SELECT 1 FROM mv_catalog LIMIT 1")
        except Exception as e:
            return jsonify(status="not ready", error=str(e).splitlines()[0]), 503
        return jsonify(status="ready")

    @app.get("/metrics")
    def metrics():
        return Response(generate_latest(), content_type=CONTENT_TYPE_LATEST)

    @app.get("/api/devops/status")
    def status():
        db = {"ok": False}
        try:
            t = time.perf_counter()
            with pool.connection(timeout=2) as conn:
                row = conn.execute("""SELECT split_part(current_setting('server_version'), ' ', 1) AS version,
                                             pg_size_pretty(pg_database_size(current_database())) AS size,
                                             (SELECT COUNT(*) FROM pg_stat_activity
                                              WHERE datname = current_database()) AS connections""").fetchone()
            db = {"ok": True, "ms": round((time.perf_counter() - t) * 1000, 1), **row}
        except Exception as e:
            db["error"] = str(e).splitlines()[0]
        try:
            pods, pods_error = list_pods(), None
        except Exception as e:
            pods, pods_error = None, str(e)
        return jsonify(
            environment=environment(), host=socket.gethostname(), namespace=namespace(),
            node=os.environ.get("NODE_NAME"),
            version=os.environ.get("APP_VERSION", "dev"), git_sha=os.environ.get("GIT_SHA", "local"),
            build_time=os.environ.get("BUILD_TIME", "unknown"), uptime_s=int(time.time() - STARTED),
            python=sys.version.split()[0], db=db, traffic=_request_totals(), pods=pods, pods_error=pods_error,
            shutdown_enabled=shutdown_allowed(), restart_hint=restart_hint())

    @app.post("/api/admin/shutdown")
    def shutdown():
        if not shutdown_allowed():
            return jsonify(error="Shutdown is disabled on this deployment"), 403
        # Browsers won't let another website add this header, so a malicious page can't trigger it.
        if request.headers.get("X-PriceScope-Action") != "shutdown":
            return jsonify(error="Missing confirmation header"), 400
        hint = restart_hint()
        if environment() == "Kubernetes":
            # A pod that exits is restarted by Kubernetes, so ask for zero replicas instead.
            k8s_api(f"/apis/apps/v1/namespaces/{namespace()}/deployments/{DEPLOYMENT}/scale",
                    method="PATCH", body={"spec": {"replicas": 0}})
        else:
            under_gunicorn = "gunicorn" in request.environ.get("SERVER_SOFTWARE", "")
            threading.Timer(0.5, _stop_process, [under_gunicorn]).start()   # let this response go out first
        app.logger.warning("Shutdown requested from the UI by %s", request.remote_addr)
        return jsonify(ok=True, environment=environment(), restart_hint=hint)
