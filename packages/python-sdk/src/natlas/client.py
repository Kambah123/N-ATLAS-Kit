"""Synchronous client for an N-ATLaS gateway."""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator, Mapping, Sequence
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
from natlas.transport import SyncTransport
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


def iter_chat_stream(response: httpx.Response) -> Iterator[ChatStreamChunk]:
    try:
        for line in response.iter_lines():
            parsed = parse_sse_line(line)
            if parsed is SSE_DONE:
                return
            if parsed is None:
                continue
            yield parse_chat_chunk(parsed)
    finally:
        response.close()


class NAtlas:
    """Synchronous client.

    ``timeout`` is seconds. ``NATLAS_TIMEOUT_MS``, when the argument is omitted,
    is milliseconds — the same variable the JavaScript SDK reads.

    .. code-block:: python

        with NAtlas() as natlas:
            reply = natlas.chat(messages=[{"role": "user", "content": "Sannu!"}], language="ha")
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
        http_client: httpx.Client | None = None,
        sleep: Callable[[float], None] | None = None,
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
        self._client = http_client if http_client is not None else httpx.Client()
        self._closed = False
        self._http = SyncTransport(
            self._client,
            self._settings,
            sleep or time.sleep,
            rng or default_rng,
        )

    def __enter__(self) -> NAtlas:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._owns_client:
            self._client.close()

    @overload
    def chat(
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
    ) -> Iterator[ChatStreamChunk]: ...

    @overload
    def chat(
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

    def chat(
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
    ) -> ChatResult | Iterator[ChatStreamChunk]:
        """Chat with N-ATLaS. ``stream=True`` returns an iterator of deltas."""
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
            response = self._http.open_stream(
                url,
                json_body=body,
                timeout=timeout_s,
                max_retries=retries,
            )
            return iter_chat_stream(response)
        payload, _status = self._http.request_json(
            "POST",
            url,
            idempotent=False,
            json_body=body,
            timeout=timeout_s,
            max_retries=retries,
        )
        return parse_chat_result(payload)

    def list_models(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> ModelList:
        """``GET /v1/models``."""
        self._ensure_open()
        payload, _status = self._http.request_json(
            "GET",
            f"{self._settings.api_base}/models",
            idempotent=True,
            timeout=_optional_timeout(timeout),
            max_retries=_optional_retries(max_retries),
        )
        return parse_model_list(payload)

    def health(
        self,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> HealthStatus:
        """``GET /health``. No API key is required.

        A degraded gateway answers 503 with JSON. That is returned, with
        ``ok=False``, rather than raised.
        """
        self._ensure_open()
        payload, status = self._http.request_json(
            "GET",
            self._settings.health_url,
            idempotent=True,
            timeout=_optional_timeout(timeout),
            max_retries=_optional_retries(max_retries),
            ok_statuses=frozenset({503}),
        )
        return parse_health(payload, status)

    def transcribe(
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
            text = self._http.request_text(
                "POST",
                url,
                idempotent=False,
                data=form,
                files=files,
                timeout=timeout_s,
                max_retries=retries,
            )
            return parse_transcription(text, lang)
        payload, _status = self._http.request_json(
            "POST",
            url,
            idempotent=False,
            data=form,
            files=files,
            timeout=timeout_s,
            max_retries=retries,
        )
        return parse_transcription(payload, lang)

    def translate(
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
        result = self._complete(
            messages,
            language=target,
            temperature=0.2 if temperature is None else temperature,
            max_tokens=1024 if max_tokens is None else max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        return translation_from(result, source, target)

    def summarize(
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
        result = self._complete(
            messages,
            language=target,
            temperature=0.3 if temperature is None else temperature,
            max_tokens=512 if max_tokens is None else max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        return summary_from(result, target)

    def detect_language(
        self,
        text: str,
        *,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> LanguageDetection:
        """Ask N-ATLaS which of the four languages ``text`` is in.

        This is a prompt, not a dedicated detector. ``language`` is ``None``
        when the reply is not a recognised code.
        """
        result = self._complete(
            detect_messages(text),
            language=None,
            temperature=0,
            max_tokens=16,
            timeout=timeout,
            max_retries=max_retries,
        )
        return detection_from(result)

    def voice_chat(
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
        """Transcribe a voice note, then ask N-ATLaS to reply.

        An empty transcript is an error. Nothing is invented in its place.
        """
        lang = normalise_language(language)
        heard = self.transcribe(
            audio=audio,
            language=lang,
            filename=filename,
            response_format="json",
            timeout=timeout,
            max_retries=max_retries,
        )
        if not heard.text.strip():
            raise BadRequestError("The transcription was empty, so there is nothing to reply to.")
        result = self._complete(
            voice_messages(heard.text, lang, instruction),
            language=lang,
            temperature=0.3 if temperature is None else temperature,
            max_tokens=512 if max_tokens is None else max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        return voice_result(heard.text, result, lang)

    def _complete(
        self,
        messages: Sequence[Mapping[str, object]],
        *,
        language: str | None,
        temperature: float | None,
        max_tokens: int | None,
        timeout: float | None,
        max_retries: int | None,
    ) -> ChatResult:
        return self.chat(
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
