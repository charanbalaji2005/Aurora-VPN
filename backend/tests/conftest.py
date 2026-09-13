from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _quiet_logging():
    from app.common.logging import configure_logging

    configure_logging("ERROR")


@pytest.fixture()
async def db():
    """In-memory Mongo double so quota and session logic can be tested
    without a running server."""
    from mongomock_motor import AsyncMongoMockClient

    import app.common.db as dbmod

    client = AsyncMongoMockClient()
    dbmod._db = client["test"]  # noqa: SLF001
    yield dbmod._db  # noqa: SLF001
    dbmod._db = None  # noqa: SLF001
