# PriceScope: DevOps Project

**BTI DS, Semester 11** · E007 Aayush Nayak · E008 Ritwik Shetty · E037 Iram Shaikh

PriceScope is a retail price tracker for about 8,800 Amazon electronics products, built with Flask and PostgreSQL.
This project delivers it the DevOps way: containerised with Docker, orchestrated with Kubernetes, and checked by a
GitHub Actions pipeline.

## Run it

You only need Docker Desktop installed.

### The quick way (Windows)

Double-click **`start.bat`** and choose Kubernetes or Docker Compose. It opens Docker Desktop if it is closed, starts
PriceScope and opens your browser. The first start takes longer because Docker has to build the image.

Double-click **`stop.bat`** to stop everything. Your data is kept for the next start, and Docker Desktop stays open.

Kubernetes mode needs Kubernetes turned on in Docker Desktop's settings. Compose mode doesn't.

### Docker Compose

```bash
docker compose up --build
```

Open <http://localhost:5000>. Compose starts the database, loads the data once, then starts the app.

To stop everything, run `docker compose down`. Add `-v` to delete the database as well.

### Kubernetes

Enable Kubernetes in Docker Desktop, then run:

```bash
powershell -ExecutionPolicy Bypass -File scripts\deploy-k8s.ps1
```

Open <http://localhost:8081>. To remove it, run `kubectl delete namespace pricescope`.

## What is in the repository

| Path | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build that produces a small image running as a non-root user |
| `docker-compose.yml` | Database, data loader and app, started in the right order |
| `k8s/` | Namespace, ConfigMap, PostgreSQL StatefulSet, loader Job, RBAC, app Deployment and Service |
| `scripts/deploy-k8s.ps1` | Builds a uniquely tagged image, creates a random database password and deploys |
| `.github/workflows/ci-cd.yml` | Lint, test, validate manifests, build, scan and publish the image |
| `tests/` | 37 pytest tests that run against a real PostgreSQL database |
| `app/` | Flask API and web UI. `app/devops.py` holds the health, metrics, status and shutdown endpoints |
| `etl/`, `sql/`, `data/clean/` | Data loading, database schema and the cleaned dataset |
| `presentation/` | The project deck and the script that builds it |

## CI/CD pipeline

Every push and pull request to `main` runs these jobs:

1. **Lint and test:** runs ruff, loads a real PostgreSQL database and runs pytest.
2. **Validate Kubernetes:** checks every manifest with kubeconform.
3. **Build, scan and publish:** runs only if jobs 1 and 2 pass. It builds the image, scans it with Trivy and runs a
   smoke test. On a push, it also publishes the image to GitHub Container Registry.

The Trivy scan only reports vulnerabilities, so it does not fail the build.

Publishing needs the repository's workflow permissions to allow package writes.

## Operations

| Address | Purpose |
|---|---|
| `/healthz` | Liveness: the process is running |
| `/readyz` | Readiness: the database is reachable and its data is loaded |
| `/metrics` | Metrics in Prometheus format. No Prometheus server is included, so nothing collects or stores them |
| `/api/devops/status` | Live data for the DevOps Dashboard page |

### Shutdown button

The **Shutdown** button at the top right of the UI stops the app. It asks for confirmation, then shows the command to
start the app again. The database keeps running.

| Running on | What the button does | Command to start again |
|---|---|---|
| Kubernetes | Scales the Deployment to 0 pods | `kubectl scale deployment pricescope-app -n pricescope --replicas=2` |
| Docker Compose | Exits the app container cleanly | `docker compose up -d app` |
| Local Python | Ends the server process | `python app/server.py` |

Anyone who can open the app can use this button, because the app has no login. To turn it off, set
`ALLOW_SHUTDOWN=false` in `k8s/01-configmap.yaml` or `docker-compose.yml`. Turn it off before exposing the app beyond
your own machine.

## Run the tests

Install the dependencies and point the `PG*` settings at a loaded PostgreSQL database (see `.env.example`), then run:

```bash
pip install -r requirements-dev.txt
ruff check app etl tests
pytest -v
```

## Rebuild the deck

```bash
cd presentation
npm install
node build.js
```

`build.js` applies the deck's theme using a script from a local Claude skill folder, at a path set near the top of the
file. On another computer, update that path or remove the `applyTheme` step.
