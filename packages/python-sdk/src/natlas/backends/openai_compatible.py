"""URL rules for the ``/serve`` gateway and any OpenAI-compatible N-ATLaS endpoint."""

from __future__ import annotations

from urllib.parse import urlsplit

from natlas.errors import BadRequestError


def resolve_openai_compatible_base(base_url: str) -> tuple[str, str]:
    """Return ``(api_base, health_url)``.

    Both of these are accepted:

    * ``http://localhost:8080``
    * ``http://localhost:8080/v1``

    ``/health`` is never under ``/v1``. A trailing slash is ignored.
    """
    parsed = urlsplit(base_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise BadRequestError(f"base_url must be an http(s) URL, got {base_url!r}.")
    trimmed = base_url.strip().rstrip("/")
    api_base = trimmed if trimmed.endswith("/v1") else f"{trimmed}/v1"
    root = api_base[: -len("/v1")]
    return api_base, f"{root}/health"
