import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import server  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database_ready():
    server.pool.wait(timeout=30)


@pytest.fixture
def client():
    return server.app.test_client()
