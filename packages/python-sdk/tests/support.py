"""Shared fixtures for mocked-HTTP client tests. No network, no GPU."""

from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest

from natlas.async_client import AsyncNAtlas
from natlas.client import NAtlas

BASE = "http://natlas.test"
API = f"{BASE}/v1"

CHAT = {
    "id": "chatcmpl-1",
    "model": "NCAIR1/N-ATLaS",
    "choices": [
        {
            "message": {"role": "assistant", "content": "Sannu da zuwa"},
            "finish_reason": "stop",
        }
    ],
    "usage": {"prompt_tokens": 11, "completion_tokens": 4, "total_tokens": 15},
}

MODELS = {
    "object": "list",
    "data": [
        {
            "id": "NCAIR1/N-ATLaS",
            "object": "model",
            "owned_by": "ncair",
            "created": 1,
        },
        {"id": "NCAIR1/Hausa-ASR", "object": "model", "owned_by": "ncair"},
    ],
}

HEALTH_OK = {
    "status": "ok",
    "version": "0.0.0",
    "llm": {"status": "ok"},
    "asr": {"status": "ok", "languages": ["ha", "ig", "yo", "en"]},
    "attribution": "N-ATLaS",
}

ENV_KEYS = (
    "NATLAS_BASE_URL",
    "NATLAS_API_KEY",
    "NATLAS_BACKEND",
    "NATLAS_MODEL",
    "NATLAS_TIMEOUT_MS",
    "NATLAS_MAX_RETRIES",
)

USER = [{"role": "user", "content": "Sannu"}]


def sse(*events: str) -> str:
    return "".join(events)


def chat_event(
    content: str,
    *,
    finish: str | None = None,
    usage: dict[str, int] | None = None,
) -> str:
    choices: list[object] = []
    if content or finish is not None:
        delta = {"content": content} if content else {}
        choices = [{"delta": delta, "finish_reason": finish}]
    payload: dict[str, object] = {
        "id": "c1",
        "model": "NCAIR1/N-ATLaS",
        "choices": choices,
    }
    if usage is not None:
        payload["usage"] = usage
    import json

    return f"data: {json.dumps(payload)}\n\n"


@pytest.fixture(autouse=True)
def _clear_natlas_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    yield


def sync_client(**overrides: object) -> tuple[NAtlas, list[float]]:
    sleeps: list[float] = []
    options: dict[str, object] = {
        "base_url": API,
        "api_key": "test-key",
        "timeout": 5.0,
        "max_retries": 2,
        "sleep": lambda seconds: sleeps.append(seconds),
        "rng": lambda: 0.0,
    }
    options.update(overrides)
    return NAtlas(**options), sleeps  # type: ignore[arg-type]


def async_client(**overrides: object) -> tuple[AsyncNAtlas, list[float]]:
    sleeps: list[float] = []

    async def sleep(seconds: float) -> None:
        sleeps.append(seconds)

    options: dict[str, object] = {
        "base_url": API,
        "api_key": "test-key",
        "timeout": 5.0,
        "max_retries": 2,
        "sleep": sleep,
        "rng": lambda: 0.0,
    }
    options.update(overrides)
    return AsyncNAtlas(**options), sleeps  # type: ignore[arg-type]


def json_response(status: int, payload: object, **headers: str) -> httpx.Response:
    return httpx.Response(status, json=payload, headers=headers)
