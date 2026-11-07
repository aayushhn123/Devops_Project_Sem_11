# Stage 1 - install the Python dependencies. Build tools stay behind in this stage.
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2 - the small image that actually ships.
FROM python:3.12-slim
ARG APP_VERSION=dev
ARG GIT_SHA=local
ARG BUILD_TIME=unknown
ENV APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA BUILD_TIME=$BUILD_TIME \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
LABEL org.opencontainers.image.title="PriceScope" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$GIT_SHA \
      org.opencontainers.image.authors="E007 Aayush Nayak, E008 Ritwik Shetty, E037 Iram Shaikh"

COPY --from=builder /install /usr/local
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin pricescope

WORKDIR /srv/pricescope
COPY app ./app
COPY etl ./etl
COPY sql ./sql
COPY data/clean ./data/clean

USER 10001
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:5000/healthz', timeout=2)"

# One worker with threads keeps the Prometheus counters in a single process.
CMD ["gunicorn", "--chdir", "app", "server:app", "--bind", "0.0.0.0:5000", \
     "--workers", "1", "--threads", "8", "--worker-tmp-dir", "/dev/shm", \
     "--access-logfile", "-", "--error-logfile", "-"]
