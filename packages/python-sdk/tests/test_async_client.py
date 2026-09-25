"""Async client against a mocked gateway."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from natlas import AsyncNAtlas, AuthError, BadRequestError, ServerError, TimeoutError

from .support import (
    API,
    BASE,
    CHAT,
    HEALTH_OK,
    MODELS,
    USER,
    async_client,
    chat_event,
    json_response,
    sse,
)


async def test_async_chat_and_stream() -> None:
    body = sse(chat_event("San"), chat_event("nu"), "data: [DONE]\n\n")
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(
            side_effect=[
                json_response(200, CHAT),
                httpx.Response(200, text=body, headers={"content-type": "text/event-stream"}),
            ]
        )
        client, _sleeps = async_client()
        async with client:
            result = await client.chat(messages=USER, language="igbo")
            deltas: list[str] = []
            async for chunk in await client.chat(messages=USER, stream=True):
                if chunk.delta:
                    deltas.append(chunk.delta)
    assert result.content == "Sannu da zuwa"
    assert "".join(deltas) == "Sannu"
    sent = json.loads(route.calls[0].request.content)
    assert sent["language"] == "ig"
    assert sent["stream"] is False
    assert json.loads(route.calls[1].request.content)["stream"] is True


async def test_async_errors_retries_and_health() -> None:
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(
            return_value=json_response(401, {"detail": "Missing or invalid API key."})
        )
        respx.get(f"{API}/models").mock(
            side_effect=[
                json_response(429, {"detail": "slow"}, **{"retry-after": "1.5"}),
                json_response(200, MODELS),
            ]
        )
        respx.get(f"{BASE}/health").mock(
            return_value=json_response(503, {**HEALTH_OK, "status": "degraded"})
        )
        client, sleeps = async_client(max_retries=0)
        with pytest.raises(AuthError):
            await client.chat(messages=USER)
        client_retry, sleeps = async_client()
        models = await client_retry.list_models()
        health = await client_retry.health()
        await client.aclose()
        await client_retry.aclose()
    assert models.data[0].id == "NCAIR1/N-ATLaS"
    assert sleeps == [1.5]
    assert isinstance(sleeps[0], float)
    assert health.ok is False


async def test_async_timeout_and_server_retry_opt_in() -> None:
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(
            side_effect=[
                httpx.ReadTimeout("slow"),
                json_response(500, {"detail": "boom"}),
                json_response(500, {"detail": "boom"}),
                json_response(200, CHAT),
            ]
        )
        client, sleeps = async_client(max_retries=0)
        with pytest.raises(TimeoutError):
            await client.chat(messages=USER)
        with pytest.raises(ServerError):
            await client.chat(messages=USER, max_retries=0)
        result = await client.chat(messages=USER, max_retries=1)
        await client.aclose()
    assert result.content == "Sannu da zuwa"
    assert sleeps == [0.2]


async def test_async_transcribe_translate_and_voice() -> None:
    with respx.mock:
        respx.post(f"{API}/audio/transcriptions").mock(
            side_effect=[
                json_response(200, {"text": "Bawo"}),
                json_response(200, {"text": "Kedu"}),
                json_response(200, {"text": "   "}),
            ]
        )
        respx.post(f"{API}/chat/completions").mock(
            side_effect=[
                json_response(
                    200,
                    {
                        **CHAT,
                        "choices": [
                            {
                                "message": {"role": "assistant", "content": "Hello"},
                                "finish_reason": "stop",
                            }
                        ],
                    },
                ),
                json_response(
                    200,
                    {
                        **CHAT,
                        "choices": [
                            {
                                "message": {"role": "assistant", "content": "Ndewo"},
                                "finish_reason": "stop",
                            }
                        ],
                    },
                ),
            ]
        )
        client, _sleeps = async_client()
        heard = await client.transcribe(audio=b"wav", language="Yoruba", filename="n.wav")
        translated = await client.translate(text="Bawo", from_="yo", to="en")
        voice = await client.voice_chat(audio=b"ogg", language="ig")
        with pytest.raises(BadRequestError, match="empty"):
            await client.voice_chat(audio=b"ogg", language="ha")
        await client.aclose()
    assert heard.language == "yo"
    assert heard.text == "Bawo"
    assert translated.source == "yo"
    assert translated.target == "en"
    assert translated.text == "Hello"
    assert voice.transcript == "Kedu"
    assert voice.reply == "Ndewo"


async def test_async_context_manager_closes() -> None:
    client = AsyncNAtlas(base_url=API, api_key="k", sleep=_noop, rng=lambda: 0.0)
    async with client:
        assert isinstance(client, AsyncNAtlas)
    with pytest.raises(Exception, match="closed"):
        await client.health()


async def _noop(_seconds: float) -> None:
    return None
