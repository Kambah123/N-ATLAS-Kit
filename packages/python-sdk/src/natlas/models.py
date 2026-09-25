"""Response models. Upstream JSON is parsed defensively; these are what callers get."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from natlas.constants import Language

ChatRole = Literal["system", "user", "assistant"]


class Usage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None
    content: str
    role: ChatRole
    finish_reason: str | None
    model: str
    usage: Usage | None
    raw: dict[str, Any]


class ChatStreamChunk(BaseModel):
    """One SSE event. ``delta`` is empty when the event only carries usage or a finish."""

    model_config = ConfigDict(extra="ignore")

    delta: str
    finish_reason: str | None = None
    model: str | None = None
    usage: Usage | None = None
    raw: dict[str, Any]


class Transcription(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    language: Language
    task: str | None = None
    duration: float | None = None
    model: str | None = None
    chunks: int | None = None
    raw: Any = None


class ModelInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    object: str | None = None
    owned_by: str | None = None
    created: int | None = None


class ModelList(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: list[ModelInfo]
    raw: dict[str, Any]


class HealthStatus(BaseModel):
    """``ok`` is true only for HTTP 200 whose ``status`` field is ``ok``.

    A degraded gateway answers 503 with a JSON body. That is returned, not
    raised — the body is the health report.
    """

    model_config = ConfigDict(extra="ignore")

    status: str
    ok: bool
    version: str | None = None
    llm: dict[str, Any] | None = None
    asr: dict[str, Any] | None = None
    attribution: str | None = None
    raw: dict[str, Any]


class Translation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    source: Language
    target: Language
    model: str


class Summary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    language: Language
    model: str


class LanguageDetection(BaseModel):
    """``language`` is ``None`` when the reply was not one of the four codes."""

    model_config = ConfigDict(extra="ignore")

    language: Language | None
    text: str
    model: str


class VoiceChatResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    transcript: str
    reply: str
    language: Language
    model: str
