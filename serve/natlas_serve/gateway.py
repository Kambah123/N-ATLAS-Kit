"""The single front door for N-ATLaS.

One base URL, one API key, both capabilities:

* ``POST /v1/chat/completions``     proxied to vLLM, streaming preserved
* ``POST /v1/audio/transcriptions`` served in-process or proxied to the ASR box
* ``GET  /v1/models``               proxied
* ``GET  /health``                  unauthenticated, reports both upstreams

Two behaviours are specific to N-ATLaS rather than generic proxying:

**``date_string`` injection.** N-ATLaS's chat template takes a ``date_string``
variable - the model card's own example passes
``datetime.now().strftime('%d %b %Y')``. We inject the same thing into every
chat request through vLLM's ``chat_template_kwargs`` so the rendered prompt
matches what the model was fine-tuned and evaluated on. Clients do not have to
know this exists.

**``language`` passthrough.** Our SDKs send a non-standard ``language`` field so
we can report usage per language. vLLM would reject the unknown key, so the
gateway strips it from the body and keeps it only for the log line.

**Sampling bounds.** Temperatures above 1.0 make N-ATLaS degenerate into
random multilingual text. Those values are clamped to 1.0. When the caller
omits them, ``top_p`` defaults to 0.9 and ``repetition_penalty`` to 1.1.
Caller-supplied values are left unchanged.
"""

from __future__ import annotations

import hmac
import json
import math
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from natlas_serve import __version__
from natlas_serve.config import Settings
from natlas_serve.languages import LANGUAGES, normalise_language
from natlas_serve.observability import (
    RequestLog,
    Stopwatch,
    configure_logging,
    key_fingerprint,
    log_request,
    new_request_id,
)

#: Required by the N-ATLaS Terms of Use, and surfaced on /health so anyone
#: integrating sees it without reading the licence.
ATTRIBUTION = (
    "N-ATLaS is an initiative of the Federal Ministry of Communications, "
    "Innovation and Digital Economy, and powered by Awarri Technologies."
)

#: Give up trying to parse usage out of a stream if a single SSE line gets
#: absurd. Protects the gateway from unbounded buffering.
_MAX_SSE_LINE = 1 << 20

#: Above this, nucleus sampling on N-ATLaS collapses into word soup.
MAX_CHAT_TEMPERATURE = 1.0
DEFAULT_TOP_P = 0.9
DEFAULT_REPETITION_PENALTY = 1.1


def clamp_temperature(value: Any) -> Any:
    """Clamp a numeric temperature above 1.0. Leave anything else untouched.

    ``bool`` is an ``int`` in Python, so it is excluded on purpose.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    number = float(value)
    if not math.isfinite(number) or number <= MAX_CHAT_TEMPERATURE:
        return value
    return MAX_CHAT_TEMPERATURE


def today_date_string(now: datetime | None = None) -> str:
    """The exact format N-ATLaS's own usage example passes: ``24 Sep 2026``."""
    return (now or datetime.now(timezone.utc)).strftime("%d %b %Y")


def extract_bearer(header: str | None) -> str | None:
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def is_authorised(key: str | None, settings: Settings) -> bool:
    """Constant-time comparison against every configured key."""
    if settings.allow_anonymous and not settings.api_keys:
        return True
    if not key:
        return False
    return any(hmac.compare_digest(key, valid) for valid in settings.api_keys)


def prepare_chat_body(
    body: dict[str, Any], settings: Settings
) -> tuple[dict[str, Any], str | None]:
    """Normalise an inbound chat request for vLLM. Returns (body, language)."""
    prepared = dict(body)

    raw_language = prepared.pop("language", None)
    language: str | None = None
    if raw_language is not None:
        try:
            language = normalise_language(raw_language)
        except ValueError:
            language = None

    prepared.setdefault("model", settings.llm_model)

    if settings.inject_date_string:
        kwargs = dict(prepared.get("chat_template_kwargs") or {})
        kwargs.setdefault("date_string", today_date_string())
        prepared["chat_template_kwargs"] = kwargs

    if settings.include_usage and prepared.get("stream"):
        options = dict(prepared.get("stream_options") or {})
        options.setdefault("include_usage", True)
        prepared["stream_options"] = options

    if "temperature" in prepared:
        prepared["temperature"] = clamp_temperature(prepared["temperature"])
    prepared.setdefault("top_p", DEFAULT_TOP_P)
    prepared.setdefault("repetition_penalty", DEFAULT_REPETITION_PENALTY)

    return prepared, language


def scan_usage(chunk: bytes, buffer: bytearray, usage: dict[str, int]) -> None:
    """Pull token counts out of an SSE stream without inspecting content.

    We only ever read the ``usage`` object from a parsed chunk. Text deltas are
    passed through to the client untouched and never stored or logged.
    """
    buffer.extend(chunk)
    while b"\n" in buffer:
        line, _, rest = bytes(buffer).partition(b"\n")
        buffer.clear()
        buffer.extend(rest)
        line = line.strip()
        if not line.startswith(b"data:"):
            continue
        payload = line[5:].strip()
        if not payload or payload == b"[DONE]":
            continue
        try:
            obj = json.loads(payload)
        except (ValueError, UnicodeDecodeError):
            continue
        found = obj.get("usage") if isinstance(obj, dict) else None
        if isinstance(found, dict):
            for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
                value = found.get(field)
                if isinstance(value, int):
                    usage[field] = value
    if len(buffer) > _MAX_SSE_LINE:
        buffer.clear()


def create_app(
    settings: Settings | None = None,
    *,
    asr_router: APIRouter | None = None,
    client: httpx.AsyncClient | None = None,
) -> FastAPI:
    """Build the gateway.

    ``asr_router`` mounts transcription in-process (the Modal single-container
    deployment). Without it, transcription is proxied to ``settings.asr_url``
    (the docker-compose deployment).
    """
    settings = settings or Settings.from_env()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        owned = client is None
        app.state.client = client or httpx.AsyncClient(timeout=settings.request_timeout)
        try:
            yield
        finally:
            if owned:
                await app.state.client.aclose()

    app = FastAPI(
        title="N-ATLaS Gateway",
        version=__version__,
        description=(
            "OpenAI-compatible gateway for N-ATLaS, Nigeria's sovereign multilingual "
            "LLM, and its four ASR models. " + ATTRIBUTION
        ),
        lifespan=lifespan,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
            max_age=600,
        )

    @app.middleware("http")
    async def tag_request(  # pyright: ignore[reportUnusedFunction]
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request.state.request_id = new_request_id()
        request.state.api_key = extract_bearer(request.headers.get("authorization"))
        response = await call_next(request)
        response.headers["X-Request-Id"] = request.state.request_id
        return response

    def require_auth(request: Request) -> str | None:
        key = getattr(request.state, "api_key", None)
        if not is_authorised(key, settings):
            raise HTTPException(
                status_code=401,
                detail="Missing or invalid API key. Send 'Authorization: Bearer <key>'.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return key

    # -- health ------------------------------------------------------------

    @app.get("/health")
    async def health(request: Request) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        http: httpx.AsyncClient = request.app.state.client
        llm: dict[str, Any] = {"model": settings.llm_model}
        try:
            resp = await http.get(f"{settings.vllm_url}/health", timeout=5.0)
            llm["status"] = "ok" if resp.status_code < 400 else "down"
        except httpx.HTTPError as exc:
            llm["status"] = "down"
            llm["error"] = type(exc).__name__

        asr: dict[str, Any] = {"languages": list(LANGUAGES), "models": settings.asr_models}
        if asr_router is not None:
            asr["status"] = "ok"
            asr["mode"] = "local"
        else:
            asr["mode"] = "proxy"
            try:
                resp = await http.get(f"{settings.asr_url}/health", timeout=5.0)
                asr["status"] = "ok" if resp.status_code < 400 else "down"
            except httpx.HTTPError as exc:
                asr["status"] = "down"
                asr["error"] = type(exc).__name__

        healthy = llm["status"] == "ok" and asr["status"] == "ok"
        return JSONResponse(
            {
                "status": "ok" if healthy else "degraded",
                "version": __version__,
                "llm": llm,
                "asr": asr,
                "attribution": ATTRIBUTION,
            },
            status_code=200 if healthy else 503,
        )

    # -- models ------------------------------------------------------------

    @app.get("/v1/models")
    async def models(request: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
        require_auth(request)
        http: httpx.AsyncClient = request.app.state.client
        try:
            resp = await http.get(f"{settings.vllm_url}/v1/models")
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"LLM upstream unreachable: {type(exc).__name__}") from exc
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/json"),
        )

    # -- chat --------------------------------------------------------------

    @app.post("/v1/chat/completions")
    async def chat(request: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
        key = require_auth(request)
        watch = Stopwatch()
        entry = RequestLog(
            request_id=request.state.request_id,
            feature="chat",
            method="POST",
            path="/v1/chat/completions",
            key=key_fingerprint(key),
        )

        try:
            raw = await request.json()
        except (ValueError, UnicodeDecodeError) as exc:
            entry.status, entry.error = 400, "invalid_json"
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(400, "Request body must be JSON.") from exc

        if not isinstance(raw, dict):
            entry.status, entry.error = 400, "invalid_json"
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(400, "Request body must be a JSON object.")

        body, language = prepare_chat_body(raw, settings)
        entry.language = language
        entry.model = str(body.get("model"))
        entry.stream = bool(body.get("stream"))

        http: httpx.AsyncClient = request.app.state.client
        url = f"{settings.vllm_url}/v1/chat/completions"

        if not entry.stream:
            try:
                resp = await http.post(url, json=body)
            except httpx.HTTPError as exc:
                entry.status, entry.error = 502, type(exc).__name__
                entry.latency_ms = watch.ms
                log_request(entry)
                raise HTTPException(502, f"LLM upstream unreachable: {type(exc).__name__}") from exc

            usage = {}
            try:
                parsed = resp.json()
                if isinstance(parsed, dict) and isinstance(parsed.get("usage"), dict):
                    usage = parsed["usage"]
            except ValueError:
                pass
            entry.prompt_tokens = usage.get("prompt_tokens")
            entry.completion_tokens = usage.get("completion_tokens")
            entry.total_tokens = usage.get("total_tokens")
            entry.status = resp.status_code
            entry.latency_ms = watch.ms
            log_request(entry)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "application/json"),
            )

        # Streaming: hand bytes straight through, watching only for `usage`.
        upstream = http.build_request("POST", url, json=body)
        try:
            resp = await http.send(upstream, stream=True)
        except httpx.HTTPError as exc:
            entry.status, entry.error = 502, type(exc).__name__
            entry.latency_ms = watch.ms
            log_request(entry)
            raise HTTPException(502, f"LLM upstream unreachable: {type(exc).__name__}") from exc

        if resp.status_code >= 400:
            content = await resp.aread()
            await resp.aclose()
            entry.status = resp.status_code
            entry.latency_ms = watch.ms
            log_request(entry)
            return Response(
                content=content,
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "application/json"),
            )

        async def relay() -> AsyncIterator[bytes]:
            buffer = bytearray()
            usage: dict[str, int] = {}
            try:
                async for chunk in resp.aiter_raw():
                    scan_usage(chunk, buffer, usage)
                    yield chunk
            finally:
                await resp.aclose()
                entry.status = 200
                entry.prompt_tokens = usage.get("prompt_tokens")
                entry.completion_tokens = usage.get("completion_tokens")
                entry.total_tokens = usage.get("total_tokens")
                entry.latency_ms = watch.ms
                log_request(entry)

        return StreamingResponse(
            relay(),
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "text/event-stream"),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # -- transcription -----------------------------------------------------

    if asr_router is not None:
        # Single-container deployment: transcription runs in this process, but
        # still behind the same Bearer auth as everything else.
        app.include_router(asr_router, dependencies=[Depends(require_auth)])
    else:

        @app.post("/v1/audio/transcriptions")
        async def transcriptions(request: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
            key = require_auth(request)
            watch = Stopwatch()
            entry = RequestLog(
                request_id=request.state.request_id,
                feature="transcription",
                method="POST",
                path="/v1/audio/transcriptions",
                key=key_fingerprint(key),
            )
            http: httpx.AsyncClient = request.app.state.client
            body = await request.body()
            headers = {
                k: v
                for k, v in request.headers.items()
                if k.lower() in ("content-type", "content-length")
            }
            try:
                resp = await http.post(
                    f"{settings.asr_url}/v1/audio/transcriptions",
                    content=body,
                    headers=headers,
                )
            except httpx.HTTPError as exc:
                entry.status, entry.error = 502, type(exc).__name__
                entry.latency_ms = watch.ms
                log_request(entry)
                raise HTTPException(502, f"ASR upstream unreachable: {type(exc).__name__}") from exc

            entry.status = resp.status_code
            entry.latency_ms = watch.ms
            log_request(entry)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "application/json"),
            )

    return app
