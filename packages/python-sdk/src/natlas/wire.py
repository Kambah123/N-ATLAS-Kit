"""Pure helpers shared by the sync and async clients: config, bodies, parsing."""

from __future__ import annotations

import json
import math
import os
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, BinaryIO, cast

from natlas.backends.hf_endpoint import resolve_hf_endpoint_base
from natlas.backends.local import local_backend_unavailable
from natlas.backends.official import official_backend_unavailable
from natlas.backends.openai_compatible import resolve_openai_compatible_base
from natlas.constants import BACKENDS, LANGUAGE_NAMES, LLM_MODEL_ID, Backend, Language
from natlas.errors import (
    AuthError,
    BadRequestError,
    NAtlasError,
    NetworkError,
    RateLimitError,
    ServerError,
    TimeoutError,
)
from natlas.languages import language_from_model_text, normalise_language
from natlas.models import (
    ChatResult,
    ChatRole,
    ChatStreamChunk,
    HealthStatus,
    LanguageDetection,
    ModelInfo,
    ModelList,
    Summary,
    Transcription,
    Translation,
    Usage,
    VoiceChatResult,
)
from natlas.version import __version__

USER_AGENT = f"natlas/{__version__}"
_RETRY_BASE_S = 0.2
_RETRY_CAP_S = 8.0
_MIME = {
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "mp3": "audio/mpeg",
    "mpeg": "audio/mpeg",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "wav": "audio/wav",
    "flac": "audio/flac",
    "webm": "audio/webm",
}

AudioInput = str | Path | bytes | bytearray | BinaryIO
ChatMessage = dict[str, str]


class _Done:
    """Sentinel for an SSE ``data: [DONE]`` line."""


SSE_DONE = _Done()


@dataclass(frozen=True)
class Settings:
    api_base: str
    health_url: str
    api_key: str | None
    backend: Backend
    model: str
    timeout_s: float
    max_retries: int
    retry_non_idempotent: bool


def resolve_settings(
    *,
    base_url: str | None,
    api_key: str | None,
    backend: str | None,
    model: str | None,
    timeout: float | None,
    max_retries: int | None,
    retry_non_idempotent: bool,
) -> Settings:
    """Constructor arguments win. Otherwise read ``NATLAS_*`` from the environment."""
    resolved_base = _first(base_url, _env("NATLAS_BASE_URL"))
    if resolved_base is None:
        raise NAtlasError(
            "Set base_url or NATLAS_BASE_URL to your N-ATLaS gateway. "
            "There is no public hosted API."
        )
    raw_backend = _first(backend, _env("NATLAS_BACKEND")) or "openai-compatible"
    resolved_backend = _resolve_backend(raw_backend)
    if resolved_backend == "hf-endpoint":
        api_base, health_url = resolve_hf_endpoint_base(resolved_base)
    else:
        api_base, health_url = resolve_openai_compatible_base(resolved_base)
    resolved_model = _first(model, _env("NATLAS_MODEL")) or LLM_MODEL_ID
    assert_ncair_model(resolved_model)
    resolved_key = _first(api_key, _env("NATLAS_API_KEY"))
    if resolved_key is not None and any(char in resolved_key for char in "\r\n"):
        raise BadRequestError("api_key contains invalid characters.")
    return Settings(
        api_base=api_base,
        health_url=health_url,
        api_key=resolved_key,
        backend=resolved_backend,
        model=resolved_model,
        timeout_s=_resolve_timeout(timeout),
        max_retries=_resolve_max_retries(max_retries),
        retry_non_idempotent=retry_non_idempotent,
    )


def assert_ncair_model(model: str) -> None:
    if not model.startswith("NCAIR1/"):
        raise BadRequestError(
            f'Model "{model}" is not an NCAIR1 model. '
            "This SDK only calls N-ATLaS and the NCAIR1 ASR models."
        )


def require_timeout(value: float, name: str) -> float:
    finite = (
        isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    )
    if not finite or value <= 0:
        raise BadRequestError(f"{name} must be a positive number of seconds.")
    return float(value)


def require_retries(value: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 8:
        raise BadRequestError(f"{name} must be an integer from 0 to 8.")
    return value


def effective_retries(
    *,
    idempotent: bool,
    call_retries: int | None,
    client_retries: int,
    retry_non_idempotent: bool,
) -> int:
    if call_retries is not None:
        return call_retries
    if not idempotent and not retry_non_idempotent:
        return 0
    return client_retries


def is_retryable(error: NAtlasError) -> bool:
    if isinstance(error, (AuthError, BadRequestError)):
        return False
    return isinstance(error, (RateLimitError, TimeoutError, NetworkError, ServerError))


def default_rng() -> float:
    """Jitter in ``[0, 1)``. Not used for anything secret."""
    return secrets.randbelow(1_000_000) / 1_000_000


def retry_delay_s(attempt: int, error: NAtlasError, rng: float) -> float:
    """``rng`` is a number in ``[0, 1)`` used as jitter, not a callable.

    Kept as a float so tests can pass ``0.0`` without wrapping a lambda in
    the delay math itself. The client supplies the random sample.
    """
    if isinstance(error, RateLimitError) and error.retry_after_s is not None:
        return error.retry_after_s
    exponential = min(_RETRY_CAP_S, _RETRY_BASE_S * float(2**attempt))
    return float(exponential) + rng * 0.1


def build_chat_body(
    *,
    messages: Sequence[Mapping[str, object]],
    stream: bool,
    language: str | None,
    temperature: float | None,
    max_tokens: int | None,
    top_p: float | None,
    model: str,
    stop: str | Sequence[str] | None,
    default_model: str,
) -> dict[str, Any]:
    chosen = model or default_model
    assert_ncair_model(chosen)
    body: dict[str, Any] = {
        "model": chosen,
        "messages": _messages(messages),
        "stream": stream,
    }
    if language is not None:
        body["language"] = normalise_language(language)
    if temperature is not None:
        finite_temp = (
            isinstance(temperature, (int, float))
            and not isinstance(temperature, bool)
            and math.isfinite(temperature)
        )
        if not finite_temp:
            raise BadRequestError("temperature must be a finite number.")
        body["temperature"] = float(temperature)
    if max_tokens is not None:
        if isinstance(max_tokens, bool) or not isinstance(max_tokens, int) or max_tokens < 1:
            raise BadRequestError("max_tokens must be a positive integer.")
        body["max_tokens"] = max_tokens
    if top_p is not None:
        finite_top_p = (
            isinstance(top_p, (int, float)) and not isinstance(top_p, bool) and math.isfinite(top_p)
        )
        if not finite_top_p:
            raise BadRequestError("top_p must be a finite number.")
        body["top_p"] = float(top_p)
    if stop is not None:
        body["stop"] = _stop(stop)
    return body


def parse_sse_line(line: str) -> object | None:
    """Return parsed JSON, :data:`SSE_DONE`, or ``None`` for a line to ignore."""
    trimmed = line.strip()
    if not trimmed or trimmed.startswith(":"):
        return None
    if not trimmed.startswith("data:"):
        return None
    data = trimmed[len("data:") :].strip()
    if not data:
        return None
    if data == "[DONE]":
        return SSE_DONE
    try:
        parsed: object = json.loads(data)
    except ValueError as exc:
        raise ServerError("The gateway sent a stream event that was not valid JSON.") from exc
    return parsed


def parse_chat_result(payload: object) -> ChatResult:
    record = _object(payload, "Chat response was not a JSON object.")
    choices = record.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ServerError("Chat response did not include any choices.")
    first = _object(choices[0], "Chat response choice was not an object.")
    message = _object(first.get("message"), "Chat response did not include a message.")
    content = message.get("content")
    if content is not None and not isinstance(content, str):
        raise ServerError("Chat message content was not text.")
    role = message.get("role")
    return ChatResult(
        id=_string(record.get("id")),
        content=content if isinstance(content, str) else "",
        role=_role(role),
        finish_reason=_string(first.get("finish_reason")),
        model=_string(record.get("model")) or LLM_MODEL_ID,
        usage=_usage(record.get("usage")),
        raw=record,
    )


def parse_chat_chunk(payload: object) -> ChatStreamChunk:
    record = _object(payload, "Stream event was not a JSON object.")
    choices = record.get("choices")
    delta = ""
    finish: str | None = None
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        first = cast(dict[str, Any], choices[0])
        delta_obj = first.get("delta")
        if isinstance(delta_obj, dict):
            content = cast(dict[str, Any], delta_obj).get("content")
            if isinstance(content, str):
                delta = content
        finish_reason = first.get("finish_reason")
        if isinstance(finish_reason, str):
            finish = finish_reason
    return ChatStreamChunk(
        delta=delta,
        finish_reason=finish,
        model=_string(record.get("model")),
        usage=_usage(record.get("usage")),
        raw=record,
    )


def parse_model_list(payload: object) -> ModelList:
    record = _object(payload, "Model list was not a JSON object with a data array.")
    data = record.get("data")
    if not isinstance(data, list):
        raise ServerError("Model list was not a JSON object with a data array.")
    models: list[ModelInfo] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        row = cast(dict[str, Any], item)
        model_id = row.get("id")
        if not isinstance(model_id, str):
            continue
        created = row.get("created")
        models.append(
            ModelInfo(
                id=model_id,
                object=_string(row.get("object")),
                owned_by=_string(row.get("owned_by")),
                created=created
                if isinstance(created, int) and not isinstance(created, bool)
                else None,
            )
        )
    return ModelList(data=models, raw=record)


def parse_health(payload: object, status_code: int) -> HealthStatus:
    record = _object(payload, "Health response was not a JSON object.")
    status = record.get("status")
    status_text = status if isinstance(status, str) else "ok" if status_code == 200 else "degraded"
    return HealthStatus(
        status=status_text,
        ok=status_code == 200 and status_text == "ok",
        version=_string(record.get("version")),
        llm=_dict_or_none(record.get("llm")),
        asr=_dict_or_none(record.get("asr")),
        attribution=_string(record.get("attribution")),
        raw=record,
    )


def parse_transcription(payload: object, language: Language) -> Transcription:
    if isinstance(payload, str):
        return Transcription(text=payload, language=language, raw=payload)
    record = _object(payload, "Transcription response did not include text.")
    text = record.get("text")
    if not isinstance(text, str):
        raise ServerError("Transcription response did not include text.")
    duration = record.get("duration")
    chunks = record.get("chunks")
    return Transcription(
        text=text,
        language=language,
        task=_string(record.get("task")),
        duration=float(duration)
        if isinstance(duration, (int, float)) and not isinstance(duration, bool)
        else None,
        model=_string(record.get("model")),
        chunks=chunks if isinstance(chunks, int) and not isinstance(chunks, bool) else None,
        raw=record,
    )


def message_from_body(body: object, fallback: str) -> str:
    if isinstance(body, str) and body.strip():
        return body.strip()
    record = body if isinstance(body, dict) else None
    if record is None:
        return fallback
    detail = record.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail
    if isinstance(detail, list):
        parts: list[str] = []
        for item in detail:
            if isinstance(item, dict) and isinstance(item.get("msg"), str):
                parts.append(cast(str, item.get("msg")))
            else:
                parts.append(json.dumps(item))
        if parts:
            return "; ".join(parts)
    error = record.get("error")
    if isinstance(error, dict):
        error_message = error.get("message")
        if isinstance(error_message, str) and error_message.strip():
            return error_message
    message = record.get("message")
    if isinstance(message, str) and message.strip():
        return message
    return fallback


def decode_body(content: bytes, content_type: str) -> object:
    if not content:
        return None
    text = content.decode("utf-8", "replace")
    trimmed = text.lstrip()
    if "json" in content_type or trimmed.startswith("{") or trimmed.startswith("["):
        try:
            parsed: object = json.loads(text)
        except ValueError:
            return text
        return parsed
    return text


def http_error(
    status: int,
    body: object,
    *,
    request_id: str | None,
    retry_after: str | None,
) -> NAtlasError:
    message = message_from_body(body, f"Request failed with HTTP {status}.")
    if status in {401, 403}:
        return AuthError(message, status=status, request_id=request_id, body=body)
    if status == 429:
        return RateLimitError(
            message,
            status=status,
            request_id=request_id,
            body=body,
            retry_after_s=parse_retry_after(retry_after),
        )
    if status == 408:
        return TimeoutError(message, status=status, request_id=request_id, body=body)
    if 400 <= status < 500:
        return BadRequestError(message, status=status, request_id=request_id, body=body)
    return ServerError(message, status=status, request_id=request_id, body=body)


def parse_retry_after(header: str | None) -> float | None:
    if not header:
        return None
    try:
        seconds = float(header)
    except ValueError:
        seconds = -1.0
    if seconds >= 0 and math.isfinite(seconds):
        return seconds
    try:
        when = parsedate_to_datetime(header)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    from datetime import datetime, timezone

    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())


def load_audio(audio: AudioInput, filename: str | None) -> tuple[str, bytes, str]:
    if isinstance(audio, (bytes, bytearray)):
        data = bytes(audio)
        name = filename or "audio"
    elif isinstance(audio, (str, Path)):
        path = Path(audio)
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise BadRequestError(f"Could not read audio file: {exc}") from exc
        name = filename or path.name
    else:
        raw: object = audio.read()
        if isinstance(raw, str) or not isinstance(raw, (bytes, bytearray)):
            raise BadRequestError("Audio file object must be opened in binary mode.")
        data = bytes(raw)
        raw_name_obj: object = getattr(audio, "name", "audio")
        raw_name = raw_name_obj if isinstance(raw_name_obj, str) else "audio"
        name = filename or Path(raw_name).name
    if not data:
        raise BadRequestError("Audio is empty.")
    return name, data, _mime(name)


def translate_messages(
    text: str, source: str, target: str
) -> tuple[list[dict[str, str]], Language, Language]:
    if not isinstance(text, str) or not text.strip():
        raise BadRequestError("text must be a non-empty string.")
    from_language = normalise_language(source)
    to_language = normalise_language(target)
    if from_language == to_language:
        raise BadRequestError("from_ and to must be different languages.")
    from_name = LANGUAGE_NAMES[from_language][0]
    to_name = LANGUAGE_NAMES[to_language][0]
    messages = [
        {
            "role": "system",
            "content": (
                "You are N-ATLaS, translating between Nigerian languages "
                "(Hausa, Igbo, Yoruba, and Nigerian English).\n"
                f"Translate the user's message from {from_name} ({from_language}) "
                f"into {to_name} ({to_language}).\n"
                "Reply with the translation only. Do not add notes, quotes, or the original text."
            ),
        },
        {"role": "user", "content": text},
    ]
    return messages, from_language, to_language


def summarize_messages(text: str, language: str) -> tuple[list[dict[str, str]], Language]:
    if not isinstance(text, str) or not text.strip():
        raise BadRequestError("text must be a non-empty string.")
    target = normalise_language(language)
    name = LANGUAGE_NAMES[target][0]
    messages = [
        {
            "role": "system",
            "content": (
                f"You are N-ATLaS. Summarise the user's text in {name}.\n"
                f"Reply with the summary only, in {name}. "
                "Keep it concise and faithful to the source."
            ),
        },
        {"role": "user", "content": text},
    ]
    return messages, target


def detect_messages(text: str) -> list[dict[str, str]]:
    if not isinstance(text, str) or not text.strip():
        raise BadRequestError("text must be a non-empty string.")
    return [
        {
            "role": "system",
            "content": (
                "You identify which of these four languages a message is written in: "
                "Hausa (ha), Igbo (ig), Yoruba (yo), or Nigerian English (en).\n"
                "Reply with only one code: ha, ig, yo, or en."
            ),
        },
        {"role": "user", "content": text},
    ]


def voice_messages(
    transcript: str, language: Language, instruction: str | None
) -> list[dict[str, str]]:
    name = LANGUAGE_NAMES[language][0]
    guidance = (
        instruction.strip()
        if instruction and instruction.strip()
        else f"Reply in {name}, naturally and concisely."
    )
    return [
        {
            "role": "system",
            "content": (
                "You are N-ATLaS, a helpful assistant. The user's message is a transcript "
                f"of a voice note in {name}.\n{guidance}"
            ),
        },
        {"role": "user", "content": transcript},
    ]


def translation_from(result: ChatResult, source: Language, target: Language) -> Translation:
    return Translation(
        text=result.content.strip(),
        source=source,
        target=target,
        model=result.model,
    )


def summary_from(result: ChatResult, language: Language) -> Summary:
    return Summary(text=result.content.strip(), language=language, model=result.model)


def detection_from(result: ChatResult) -> LanguageDetection:
    text = result.content.strip()
    return LanguageDetection(
        language=language_from_model_text(result.content),
        text=text,
        model=result.model,
    )


def voice_result(transcript: str, result: ChatResult, language: Language) -> VoiceChatResult:
    return VoiceChatResult(
        transcript=transcript,
        reply=result.content.strip(),
        language=language,
        model=result.model,
    )


def assert_response_format(value: str) -> str:
    if value not in {"json", "text", "verbose_json"}:
        raise BadRequestError('response_format must be "json", "text", or "verbose_json".')
    return value


def _messages(messages: object) -> list[dict[str, str]]:
    if (
        not isinstance(messages, Sequence)
        or isinstance(messages, (str, bytes))
        or len(messages) == 0
    ):
        raise BadRequestError("messages must be a non-empty sequence.")
    cleaned: list[dict[str, str]] = []
    for index, message in enumerate(messages):
        if not isinstance(message, Mapping):
            raise BadRequestError(f"messages[{index}] must be a mapping.")
        role = message.get("role")
        content = message.get("content")
        if role not in {"system", "user", "assistant"}:
            raise BadRequestError(
                f'messages[{index}].role must be "system", "user", or "assistant".'
            )
        if not isinstance(content, str) or content == "":
            raise BadRequestError(f"messages[{index}].content must be a non-empty string.")
        cleaned.append({"role": role, "content": content})
    return cleaned


def _stop(stop: str | Sequence[str]) -> str | list[str]:
    if isinstance(stop, str):
        return stop
    if (
        isinstance(stop, Sequence)
        and not isinstance(stop, (str, bytes))
        and all(isinstance(item, str) for item in stop)
    ):
        return list(stop)
    raise BadRequestError("stop must be a string or a sequence of strings.")


def _usage(value: object) -> Usage | None:
    if not isinstance(value, dict):
        return None
    row = cast(dict[str, Any], value)
    prompt = _number(row.get("prompt_tokens"))
    completion = _number(row.get("completion_tokens"))
    total = _number(row.get("total_tokens"))
    if prompt is None and completion is None and total is None:
        return None
    return Usage(
        prompt_tokens=int(prompt or 0),
        completion_tokens=int(completion or 0),
        total_tokens=int(total or 0),
    )


def _object(value: object, message: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ServerError(message)
    return cast(dict[str, Any], value)


def _dict_or_none(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return cast(dict[str, Any], value)


def _string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value)


def _role(value: object) -> ChatRole:
    if value == "system" or value == "user" or value == "assistant":
        return value
    return "assistant"


def _mime(filename: str) -> str:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _MIME.get(extension, "application/octet-stream")


def _resolve_backend(value: str) -> Backend:
    if value == "openai-compatible":
        return "openai-compatible"
    if value == "hf-endpoint":
        return "hf-endpoint"
    if value == "official":
        official_backend_unavailable()
    if value == "local":
        local_backend_unavailable()
    names = ", ".join(BACKENDS)
    raise BadRequestError(f'Unknown backend "{value}". Expected one of: {names}.')


def _resolve_timeout(explicit: float | None) -> float:
    if explicit is not None:
        return require_timeout(explicit, "timeout")
    env = _env("NATLAS_TIMEOUT_MS")
    if env is not None:
        try:
            parsed = float(env)
        except ValueError as exc:
            raise BadRequestError(
                "NATLAS_TIMEOUT_MS must be a positive number of milliseconds."
            ) from exc
        if not math.isfinite(parsed) or parsed <= 0:
            raise BadRequestError("NATLAS_TIMEOUT_MS must be a positive number of milliseconds.")
        return parsed / 1000.0
    return 60.0


def _resolve_max_retries(explicit: int | None) -> int:
    if explicit is not None:
        return require_retries(explicit, "max_retries")
    env = _env("NATLAS_MAX_RETRIES")
    if env is not None:
        try:
            parsed = int(env)
        except ValueError as exc:
            raise BadRequestError("NATLAS_MAX_RETRIES must be an integer from 0 to 8.") from exc
        return require_retries(parsed, "NATLAS_MAX_RETRIES")
    return 2


def _first(*values: str | None) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
