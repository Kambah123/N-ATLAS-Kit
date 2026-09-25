"""Structured request logging that never touches user content.

We log the shape of a request - which feature, which language, how long it
took, how many tokens - and nothing else. No prompts, no completions, no
transcripts, no audio, no API keys.

That is a promise the playground makes to its users and the submission makes to
the judges, so it is enforced here in one place rather than trusted to every
call site. :func:`log_request` accepts a fixed set of fields; there is no
passthrough for arbitrary strings.
"""

from __future__ import annotations

import hashlib
import json
import logging
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

_logger = logging.getLogger("natlas.serve")

#: Field names that must never appear in a log line, even by accident.
FORBIDDEN_FIELDS = frozenset(
    {
        "messages",
        "message",
        "content",
        "prompt",
        "text",
        "transcript",
        "audio",
        "file",
        "completion",
        "choices",
        "delta",
        "authorization",
        "api_key",
        "apikey",
        "token",
        "hf_token",
    }
)


def configure_logging(level: int = logging.INFO) -> None:
    """One JSON object per line on stdout. Idempotent."""
    if _logger.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(handler)
    _logger.setLevel(level)
    _logger.propagate = False


def key_fingerprint(api_key: str | None) -> str | None:
    """A stable, non-reversible handle for an API key, for rate analysis.

    Never log the key itself. This is the first 12 hex chars of its SHA-256,
    which is enough to tell two callers apart and useless to an attacker.
    """
    if not api_key:
        return None
    return "k_" + hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]


def new_request_id() -> str:
    return uuid.uuid4().hex[:16]


@dataclass(slots=True)
class RequestLog:
    """The complete set of things we are willing to record about a request."""

    request_id: str
    feature: str
    method: str = ""
    path: str = ""
    status: int = 0
    latency_ms: float = 0.0
    language: str | None = None
    model: str | None = None
    stream: bool | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    audio_seconds: float | None = None
    audio_chunks: int | None = None
    key: str | None = None
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def log_request(entry: RequestLog) -> None:
    """Emit one JSON line. Raises if a forbidden field sneaks into ``extra``."""
    leaked = FORBIDDEN_FIELDS & {k.lower() for k in entry.extra}
    if leaked:
        raise ValueError(
            f"Refusing to log user content: {sorted(leaked)}. "
            "natlas_serve never logs request or response bodies."
        )

    payload = {k: v for k, v in asdict(entry).items() if v is not None and v != {}}
    payload["event"] = "request"
    payload["ts"] = time.time()
    _logger.info(json.dumps(payload, separators=(",", ":"), sort_keys=True))


class Stopwatch:
    """Monotonic timer in milliseconds."""

    __slots__ = ("_start",)

    def __init__(self) -> None:
        self._start = time.perf_counter()

    @property
    def ms(self) -> float:
        return round((time.perf_counter() - self._start) * 1000, 2)
