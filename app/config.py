"""Connection settings, read from the .env file in the project root."""
import os
from pathlib import Path

from psycopg.conninfo import make_conninfo

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> dict:
    env = {"PGHOST": "localhost", "PGPORT": "5432", "PGUSER": "postgres",
           "PGPASSWORD": "", "PGDATABASE": "price_tracker"}
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    for k in env:                      # real environment variables win
        env[k] = os.environ.get(k, env[k])
    return env


DB_NAME = load_env()["PGDATABASE"]


def conninfo(dbname: str | None = None) -> str:
    e = load_env()
    return make_conninfo(host=e["PGHOST"], port=e["PGPORT"], user=e["PGUSER"],
                         password=e["PGPASSWORD"], dbname=dbname or e["PGDATABASE"])
