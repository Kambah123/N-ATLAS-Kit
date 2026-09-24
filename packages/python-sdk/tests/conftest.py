"""Shared pytest fixtures.

Integration tests only run when ``NATLAS_BASE_URL`` points at a real N-ATLaS
endpoint. Everything else must pass offline with no network access.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Skip ``@pytest.mark.integration`` unless a live endpoint is configured."""
    if os.environ.get("NATLAS_BASE_URL"):
        return

    skip = pytest.mark.skip(reason="set NATLAS_BASE_URL to run integration tests")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def base_url() -> Iterator[str]:
    """The live endpoint under test. Only meaningful for integration tests."""
    url = os.environ.get("NATLAS_BASE_URL")
    if not url:
        pytest.skip("NATLAS_BASE_URL is not set")
    yield url.rstrip("/")
