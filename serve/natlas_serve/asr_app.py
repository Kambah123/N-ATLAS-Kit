"""``POST /v1/audio/transcriptions`` - OpenAI-compatible, N-ATLaS underneath.

Same request shape as OpenAI's endpoint (multipart ``file``, plus ``model`` and
``response_format``), with one required addition: ``language``. N-ATLaS has no
single multilingual ASR model - it has four, and the language picks which one
handles the request.

Accepts anything ffmpeg can read and any length; :mod:`natlas_serve.audio`
handles the 16 kHz mono conversion and the 30-second chunking.
"""

from __future__ import annotations

from typing import Annotated

import anyio
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse

from natlas_serve import audio as audio_mod
from natlas_serve.config import Settings
from natlas_serve.languages import (
    LANGUAGES,
    UnsupportedLanguageError,
    normalise_language,
)
from natlas_serve.observability import (
    RequestLog,
    Stopwatch,
    key_fingerprint,
    log_request,
    new_request_id,
)
from natlas_serve.transcriber import Transcriber, WhisperTranscriber

SUPPORTED_FORMATS = ("json", "text", "verbose_json")


def build_router(settings: Settings, transcriber: Transcriber) -> APIRouter:
    """The transcription route, mountable standalone or inside the gateway."""
    router = APIRouter()

    # response_model=None: the route returns either JSON or plain text
    # depending on `response_format`, which is not a single pydantic shape.
    @router.post("/v1/audio/transcriptions", response_model=None)
    async def transcribe(  # pyright: ignore[reportUnusedFunction]
        request: Request,
        file: Annotated[UploadFile, File(description="ogg/opus, mp3, m4a, wav, flac...")],
        language: Annotated[str, Form(description="One of: ha, ig, yo, en")],
        model: Annotated[str | None, Form(description="Ignored; language picks the model")] = None,
        response_format: Annotated[str, Form()] = "json",
        prompt: Annotated[str | None, Form()] = None,
        temperature: Annotated[float | None, Form()] = None,
    ) -> JSONResponse | PlainTextResponse:
        _ = model, prompt, temperature  # accepted for OpenAI compatibility
        watch = Stopwatch()
        request_id = getattr(request.state, "request_id", None) or new_request_id()
        entry = RequestLog(
            request_id=request_id,
            feature="transcription",
            method="POST",
            path="/v1/audio/transcriptions",
            key=key_fingerprint(getattr(request.state, "api_key", None)),
        )

        if response_format not in SUPPORTED_FORMATS:
            entry.status, entry.error = 400, "bad_response_format"
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(
                status_code=400,
                detail=f"response_format must be one of {', '.join(SUPPORTED_FORMATS)}.",
            )

        try:
            lang = normalise_language(language)
        except UnsupportedLanguageError as exc:
            entry.status, entry.error = 400, "unsupported_language"
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        entry.language = lang
        entry.model = settings.asr_models[lang]

        data = await file.read()
        if len(data) > settings.max_upload_bytes:
            entry.status, entry.error = 413, "upload_too_large"
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(
                status_code=413,
                detail=f"Audio exceeds {settings.max_upload_bytes} bytes.",
            )

        try:
            chunks, duration = await anyio.to_thread.run_sync(
                lambda: audio_mod.prepare(
                    data,
                    filename=file.filename,
                    chunk_seconds=settings.asr_chunk_seconds,
                )
            )
        except audio_mod.AudioError as exc:
            entry.status, entry.error = 400, "undecodable_audio"
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        entry.audio_seconds = duration
        entry.audio_chunks = len(chunks)

        def run() -> list[str]:
            return [transcriber.transcribe(chunk, lang) for chunk in chunks]

        try:
            pieces = await anyio.to_thread.run_sync(run)
        except Exception as exc:
            entry.status, entry.error = 500, type(exc).__name__
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(
                status_code=500,
                detail=f"Transcription failed: {type(exc).__name__}",
            ) from exc

        text = " ".join(piece for piece in pieces if piece).strip()

        entry.status = 200
        entry.latency_ms = watch.ms
        log_request(entry)

        if response_format == "text":
            return PlainTextResponse(text)

        body: dict[str, object] = {"text": text}
        if response_format == "verbose_json":
            body.update(
                {
                    "task": "transcribe",
                    "language": lang,
                    "duration": duration,
                    "model": settings.asr_models[lang],
                    "chunks": len(chunks),
                }
            )
        return JSONResponse(body)

    return router


def create_app(settings: Settings | None = None) -> FastAPI:
    """Standalone ASR service, for the docker-compose deployment."""
    settings = settings or Settings.from_env()
    transcriber = WhisperTranscriber(settings.asr_models, device=settings.asr_device)

    app = FastAPI(
        title="N-ATLaS ASR",
        version="0.1.0",
        description="Speech-to-text for Hausa, Igbo, Yoruba and Nigerian English.",
    )
    app.include_router(build_router(settings, transcriber))

    @app.get("/health")
    async def health() -> dict[str, object]:  # pyright: ignore[reportUnusedFunction]
        return {
            "status": "ok",
            "service": "asr",
            "device": transcriber.device,
            "languages": list(LANGUAGES),
            "models": settings.asr_models,
            "loaded": transcriber.loaded_languages(),
        }

    return app
