"""HTTP with timeouts and retries. Idempotent GETs retry; chat and transcription do not,
unless the caller opts in. A retry can run the model twice.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from natlas.errors import NAtlasError, NetworkError, ServerError, TimeoutError
from natlas.wire import (
    USER_AGENT,
    Settings,
    decode_body,
    effective_retries,
    http_error,
    is_retryable,
    retry_delay_s,
)


class SyncTransport:
    def __init__(
        self,
        client: httpx.Client,
        settings: Settings,
        sleep: Callable[[float], None],
        rng: Callable[[], float],
    ) -> None:
        self._client = client
        self._settings = settings
        self._sleep = sleep
        self._rng = rng

    def request_json(
        self,
        method: str,
        url: str,
        *,
        idempotent: bool,
        json_body: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        ok_statuses: frozenset[int] = frozenset(),
    ) -> tuple[object, int]:
        response = self.exchange(
            method,
            url,
            idempotent=idempotent,
            json_body=json_body,
            data=data,
            files=files,
            timeout=timeout,
            max_retries=max_retries,
            ok_statuses=ok_statuses,
        )
        try:
            return _json_from_response(response), response.status_code
        finally:
            response.close()

    def request_text(
        self,
        method: str,
        url: str,
        *,
        idempotent: bool,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> str:
        response = self.exchange(
            method,
            url,
            idempotent=idempotent,
            data=data,
            files=files,
            timeout=timeout,
            max_retries=max_retries,
        )
        try:
            return response.text
        finally:
            response.close()

    def open_stream(
        self,
        url: str,
        *,
        json_body: dict[str, Any],
        timeout: float | None,
        max_retries: int | None,
    ) -> httpx.Response:
        return self.exchange(
            "POST",
            url,
            idempotent=False,
            json_body=json_body,
            timeout=timeout,
            max_retries=max_retries,
            stream=True,
        )

    def exchange(
        self,
        method: str,
        url: str,
        *,
        idempotent: bool,
        json_body: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        stream: bool = False,
        ok_statuses: frozenset[int] = frozenset(),
    ) -> httpx.Response:
        retries = effective_retries(
            idempotent=idempotent,
            call_retries=max_retries,
            client_retries=self._settings.max_retries,
            retry_non_idempotent=self._settings.retry_non_idempotent,
        )
        timeout_s = self._settings.timeout_s if timeout is None else timeout
        error: NAtlasError | None = None
        for attempt in range(retries + 1):
            try:
                request = _build_request(
                    self._client,
                    method,
                    url,
                    api_key=self._settings.api_key,
                    stream=stream,
                    json_body=json_body,
                    data=data,
                    files=files,
                    timeout_s=timeout_s,
                )
                response = self._client.send(
                    request,
                    stream=stream,
                    follow_redirects=method == "GET",
                )
            except httpx.HTTPError as exc:
                mapped = _map_transport(exc)
                error = mapped
                if attempt < retries and is_retryable(mapped):
                    self._sleep(retry_delay_s(attempt, mapped, self._rng()))
                    continue
                raise mapped from exc
            if _is_ok(response.status_code, ok_statuses):
                return response
            if stream:
                response.read()
            failure = _failure(response)
            response.close()
            error = failure
            if attempt < retries and is_retryable(failure):
                self._sleep(retry_delay_s(attempt, failure, self._rng()))
                continue
            raise failure
        raise error if error is not None else NAtlasError("Request failed without a response.")


class AsyncTransport:
    def __init__(
        self,
        client: httpx.AsyncClient,
        settings: Settings,
        sleep: Callable[[float], Awaitable[None]],
        rng: Callable[[], float],
    ) -> None:
        self._client = client
        self._settings = settings
        self._sleep = sleep
        self._rng = rng

    async def request_json(
        self,
        method: str,
        url: str,
        *,
        idempotent: bool,
        json_body: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        ok_statuses: frozenset[int] = frozenset(),
    ) -> tuple[object, int]:
        response = await self.exchange(
            method,
            url,
            idempotent=idempotent,
            json_body=json_body,
            data=data,
            files=files,
            timeout=timeout,
            max_retries=max_retries,
            ok_statuses=ok_statuses,
        )
        try:
            return _json_from_response(response), response.status_code
        finally:
            await response.aclose()

    async def request_text(
        self,
        method: str,
        url: str,
        *,
        idempotent: bool,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> str:
        response = await self.exchange(
            method,
            url,
            idempotent=idempotent,
            data=data,
            files=files,
            timeout=timeout,
            max_retries=max_retries,
        )
        try:
            return response.text
        finally:
            await response.aclose()

    async def open_stream(
        self,
        url: str,
        *,
        json_body: dict[str, Any],
        timeout: float | None,
        max_retries: int | None,
    ) -> httpx.Response:
        return await self.exchange(
            "POST",
            url,
            idempotent=False,
            json_body=json_body,
            timeout=timeout,
            max_retries=max_retries,
            stream=True,
        )

    async def exchange(
        self,
        method: str,
        url: str,
        *,
        idempotent: bool,
        json_body: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        stream: bool = False,
        ok_statuses: frozenset[int] = frozenset(),
    ) -> httpx.Response:
        retries = effective_retries(
            idempotent=idempotent,
            call_retries=max_retries,
            client_retries=self._settings.max_retries,
            retry_non_idempotent=self._settings.retry_non_idempotent,
        )
        timeout_s = self._settings.timeout_s if timeout is None else timeout
        error: NAtlasError | None = None
        for attempt in range(retries + 1):
            try:
                request = _build_request(
                    self._client,
                    method,
                    url,
                    api_key=self._settings.api_key,
                    stream=stream,
                    json_body=json_body,
                    data=data,
                    files=files,
                    timeout_s=timeout_s,
                )
                response = await self._client.send(
                    request, stream=stream, follow_redirects=method == "GET"
                )
            except httpx.HTTPError as exc:
                mapped = _map_transport(exc)
                error = mapped
                if attempt < retries and is_retryable(mapped):
                    await self._sleep(retry_delay_s(attempt, mapped, self._rng()))
                    continue
                raise mapped from exc
            if _is_ok(response.status_code, ok_statuses):
                return response
            if stream:
                await response.aread()
            failure = _failure(response)
            await response.aclose()
            error = failure
            if attempt < retries and is_retryable(failure):
                await self._sleep(retry_delay_s(attempt, failure, self._rng()))
                continue
            raise failure
        raise error if error is not None else NAtlasError("Request failed without a response.")


def _build_request(
    client: httpx.Client | httpx.AsyncClient,
    method: str,
    url: str,
    *,
    api_key: str | None,
    stream: bool,
    json_body: dict[str, Any] | None,
    data: dict[str, str] | None,
    files: dict[str, tuple[str, bytes, str]] | None,
    timeout_s: float,
) -> httpx.Request:
    headers = {
        "Accept": "text/event-stream" if stream else "application/json",
        "User-Agent": USER_AGENT,
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    kwargs: dict[str, Any] = {"headers": headers}
    if json_body is not None:
        kwargs["json"] = json_body
    if data is not None:
        kwargs["data"] = data
    if files is not None:
        kwargs["files"] = files
    request = client.build_request(method, url, **kwargs)
    request.extensions["timeout"] = httpx.Timeout(timeout_s).as_dict()
    return request


def _json_from_response(response: httpx.Response) -> object:
    text = response.text
    if not text.strip():
        return None
    try:
        parsed: object = json.loads(text)
    except ValueError as exc:
        raise ServerError(
            "The gateway returned invalid JSON.",
            status=response.status_code,
            request_id=response.headers.get("x-request-id"),
        ) from exc
    return parsed


def _failure(response: httpx.Response) -> NAtlasError:
    body = decode_body(response.content, response.headers.get("content-type", ""))
    return http_error(
        response.status_code,
        body,
        request_id=response.headers.get("x-request-id"),
        retry_after=response.headers.get("retry-after"),
    )


def _is_ok(status: int, ok_statuses: frozenset[int]) -> bool:
    return status < 400 or status in ok_statuses


def _map_transport(exc: httpx.HTTPError) -> NAtlasError:
    name = type(exc).__name__
    if isinstance(exc, httpx.TimeoutException):
        return TimeoutError(f"Request timed out: {name}.")
    return NetworkError(f"Network error: {name}.")
