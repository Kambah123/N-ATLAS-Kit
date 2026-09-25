"""Typed failures from the gateway, or from the client before a request is sent.

Messages never include the API key, the prompt, or a transcript.
"""

from __future__ import annotations


class NAtlasError(Exception):
    """Base class for every error raised by :mod:`natlas`."""

    code = "error"

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        request_id: str | None = None,
        body: object = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.request_id = request_id
        self.body = body


class AuthError(NAtlasError):
    """401 or 403. The API key is missing or not accepted."""

    code = "auth"


class RateLimitError(NAtlasError):
    """429. ``retry_after_s`` comes from the ``Retry-After`` header when present."""

    code = "rate_limit"
    retry_after_s: float | None = None

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        request_id: str | None = None,
        body: object = None,
        retry_after_s: float | None = None,
    ) -> None:
        super().__init__(message, status=status, request_id=request_id, body=body)
        self.retry_after_s = retry_after_s


class BadRequestError(NAtlasError):
    """4xx that is not authentication or rate limiting, including local validation."""

    code = "bad_request"


class ServerError(NAtlasError):
    """5xx, including a gateway 502 when vLLM or ASR is unreachable."""

    code = "server"


class NetworkError(NAtlasError):
    """DNS, connection, or other transport failure."""

    code = "network"


class TimeoutError(NAtlasError):
    """The configured timeout elapsed before the gateway finished responding."""

    code = "timeout"


class AbortError(NAtlasError):
    """Reserved for a caller-initiated cancel.

    The async client does not convert :class:`asyncio.CancelledError` into
    this type — cancelling a task still cancels it. Timeouts raise
    :class:`TimeoutError`.
    """

    code = "abort"
