"""Asynchronous client for an N-ATLaS gateway."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from typing import Literal, overload

import httpx

from natlas.errors import BadRequestError, NAtlasError
from natlas.languages import normalise_language
from natlas.models import (
    ChatResult,
    ChatStreamChunk,
    HealthStatus,
    LanguageDetection,
    ModelList,
    Summary,
    Transcription,
    Translation,
    VoiceChatResult,
)
from natlas.transport import AsyncTransport
from natlas.wire import (
    SSE_DONE,
    AudioInput,
    Settings,
    assert_response_format,
    build_chat_body,
    default_rng,
    detect_messages,
    detection_from,
    load_audio,
    parse_chat_chunk,
    parse_chat_result,
    parse_health,
    parse_model_list,
    parse_sse_line,
    parse_transcription,
    require_retries,
    require_timeout,
    resolve_settings,
    summarize_messages,
    summary_from,
    translate_messages,
    translation_from,
    voice_messages,
    voice_result,
)


async def _default_sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


async def _aiter(response: httpx.Response) -> AsyncIterator[ChatStreamChunk]:
    try:
        async for line in response.aiter_lines():
            parsed = parse_sse_line(line)
            if parsed is SSE_DONE:
                return
            if parsed is None:
                continue
            yield parse_chat_chunk(parsed)
    finally:
        await response.aclose()


class AsyncNAtlas:
    """Asynchronous client. Use it as an async context manager.

    .. code-block:: python

        async with AsyncNAtlas() as natlas:
            async for chunk in await natlas.chat(messages=[...], stream=True):
                print(chunk.delta, end="")

    ``timeout`` is seconds. See :class:`natlas.client.NAtlas` for configuration.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        backend: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        retry_non_idempotent: bool = False,
        http_client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
        rng: Callable[[], float] | None = None,
    ) -> None:
        self._settings: Settings = resolve_settings(
            base_url=base_url,
            api_key=api_key,
            backend=backend,
            model=model,
            timeout=timeout,
            max_retries=max_retries,
            retry_non_idempotent=retry_non_idempotent,
        )
        self._owns_client = http_client is None
        self._client = http_client if http_client is not None else httpx.AsyncClient()
        self._closed = False
        self._http = AsyncTransport(
            self._client,
            self._settings,
            sleep or _default_sleep,
            rng or default_rng,
        )

    async def __aenter__(self) -> AsyncNAtlas:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._owns_client:
            await self._client.aclose()

    @overload
    async def chat(
        self,
        *,
        messages: Sequence[Mapping[str, object]],
        stream: Literal[True],
        language: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        top_p: float | None = None,
        model: str | None = None,
        stop: str | Sequence[str] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> AsyncIterator[ChatStreamChunk]: ...

    @overload
    async def chat(
        self,
        *,
        messages: Sequence[Mapping[str, object]],
        stream: Literal[False] = False,
        language: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        top_p: float | None = None,
        model: str | None = None,
        stop: str | Sequence[str] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> ChatResult: ...

    async def chat(
        self,
        *,
        messages: Sequence[Mapping[str, object]],
        stream: bool = False,
        language: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        top_p: float | None = None,
        model: str | None = None,
        stop: str | Sequence[str] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> ChatResult | AsyncIterator[ChatStreamChunk]:
        """Chat with N-ATLaS. ``stream=True`` resolves to an async iterator of deltas."""
        self._ensure_open()
        body = build_chat_body(
            messages=messages,
            stream=stream,
            language=language,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            model=model or self._settings.model,
            stop=stop,
            default_model=self._settings.model,
        )
        url = f"{self._settings.api_base}/chat/completions"
        timeout_s = _optional_timeout(timeout)
        retries = _optional_retries(max_retries)
        if stream:
            response = await self._http.open_stream(
                url, json_body=body, timeout=timeout_s, max_retries=retries
            )
            return _aiter(response)
        payload, _status = await self._http.request_json(
            "POST",
            url,
            idempotent=False,
            json_body=body,
            timeout=timeout_s,
            max_retries=retries,
        )
        return parse_chat_result(payload)

    async def list_models(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> ModelList:
        """``GET /v1/models``."""
        self._ensure_open()
        payload, _status = await self._http.request_json(
            "GET",
            f"{self._settings.api_base}/models",
            idempotent=True,
            timeout=_optional_timeout(timeout),
            max_retries=_optional_retries(max_retries),
        )
        return parse_model_list(payload)

    async def health(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> HealthStatus:
        """``GET /health``. A 503 degraded body is returned with ``ok=False``."""
        self._ensure_open()
        payload, status = await self._http.request_json(
            "GET",
            self._settings.health_url,
            idempotent=True,
            timeout=_optional_timeout(timeout),
            max_retries=_optional_retries(max_retries),
            ok_statuses=frozenset({503}),
        )
        return parse_health(payload, status)

    async def transcribe(
        self,
        *,
        audio: AudioInput,
        language: str,
        filename: str | None = None,
        response_format: str = "json",
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> Transcription:
        """Transcribe audio. ``language`` selects the NCAIR1 ASR model."""
        self._ensure_open()
        lang = normalise_language(language)
        fmt = assert_response_format(response_format)
        name, data, content_type = load_audio(audio, filename)
        url = f"{self._settings.api_base}/audio/transcriptions"
        files = {"file": (name, data, content_type)}
        form = {"language": lang, "response_format": fmt}
        timeout_s = _optional_timeout(timeout)
        retries = _optional_retries(max_retries)
        if fmt == "text":
            text = await self._http.request_text(
                "POST",
                url,
                idempotent=False,
                data=form,
                files=files,
                timeout=timeout_s,
                max_retries=retries,
            )
            return parse_transcription(text, lang)
        payload, _status = await self._http.request_json(
            "POST",
            url,
            idempotent=False,
            data=form,
            files=files,
            timeout=timeout_s,
            max_retries=retries,
        )
        return parse_transcription(payload, lang)

    async def translate(
        self,
        *,
        text: str,
        from_: str,
        to: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> Translation:
        """Translate between Hausa, Igbo, Yoruba, and Nigerian English via N-ATLaS."""
        messages, source, target = translate_messages(text, from_, to)
        result = await self._complete(
            messages,
            language=target,
            temperature=0.2 if temperature is None else temperature,
            max_tokens=1024 if max_tokens is None else max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        return translation_from(result, source, target)

    async def summarize(
        self,
        *,
        text: str,
        language: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> Summary:
        """Summarise text in one of the four languages. The summary is the model's."""
        messages, target = summarize_messages(text, language)
        result = await self._complete(
            messages,
            language=target,
            temperature=0.3 if temperature is None else temperature,
            max_tokens=512 if max_tokens is None else max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        return summary_from(result, target)

    async def detect_language(
        self,
        text: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> LanguageDetection:
        """Ask N-ATLaS which of the four languages ``text`` is in."""
        result = await self._complete(
            detect_messages(text),
            language=None,
            temperature=0,
            max_tokens=16,
            timeout=timeout,
            max_retries=max_retries,
        )
        return detection_from(result)

    async def voice_chat(
        self,
        *,
        audio: AudioInput,
        language: str,
        filename: str | None = None,
        instruction: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> VoiceChatResult:
        """Transcribe a voice note, then ask N-ATLaS to reply."""
        lang = normalise_language(language)
        heard = await self.transcribe(
            audio=audio,
            language=lang,
            filename=filename,
            response_format="json",
            timeout=timeout,
            max_retries=max_retries,
        )
        if not heard.text.strip():
            raise BadRequestError("The transcription was empty, so there is nothing to reply to.")
        result = await self._complete(
            voice_messages(heard.text, lang, instruction),
            language=lang,
            temperature=0.3 if temperature is None else temperature,
            max_tokens=512 if max_tokens is None else max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        return voice_result(heard.text, result, lang)

    async def _complete(
        self,
        messages: Sequence[Mapping[str, object]],
        *,
        language: str | None,
        temperature: float | None,
        max_tokens: int | None,
        timeout: float | None,
        max_retries: int | None,
    ) -> ChatResult:
        return await self.chat(
            messages=messages,
            stream=False,
            language=language,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )

    def _ensure_open(self) -> None:
        if self._closed:
            raise NAtlasError("This client is closed.")


def _optional_timeout(value: float | None) -> float | None:
    if value is None:
        return None
    return require_timeout(value, "timeout")


def _optional_retries(value: int | None) -> int | None:
    if value is None:
        return None
    return require_retries(value, "max_retries")
