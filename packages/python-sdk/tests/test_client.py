"""Sync client against a mocked gateway. Nothing here needs a GPU or a live server."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from natlas import (
    AuthError,
    BadRequestError,
    NAtlas,
    NAtlasError,
    NetworkError,
    RateLimitError,
    ServerError,
    TimeoutError,
)
from natlas.constants import ASR_MODEL_IDS

from .support import (
    API,
    BASE,
    CHAT,
    HEALTH_OK,
    MODELS,
    USER,
    chat_event,
    json_response,
    sse,
    sync_client,
)


def test_chat_posts_an_openai_compatible_completion() -> None:
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(
            return_value=json_response(200, CHAT, **{"x-request-id": "req-1"})
        )
        client, _sleeps = sync_client()
        result = client.chat(
            messages=USER,
            language="Hausa",
            temperature=0.3,
            max_tokens=128,
            top_p=0.9,
            stop=["\n"],
        )
        client.close()

    assert result.content == "Sannu da zuwa"
    assert result.role == "assistant"
    assert result.finish_reason == "stop"
    assert result.model == "NCAIR1/N-ATLaS"
    assert result.id == "chatcmpl-1"
    assert result.usage is not None
    assert result.usage.prompt_tokens == 11
    assert result.usage.total_tokens == 15
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer test-key"
    assert request.headers["user-agent"] == "natlas/0.1.0"
    body = json.loads(request.content)
    assert body == {
        "model": "NCAIR1/N-ATLaS",
        "messages": USER,
        "stream": False,
        "language": "ha",
        "temperature": 0.3,
        "max_tokens": 128,
        "top_p": 0.9,
        "stop": ["\n"],
    }
    assert request.extensions["timeout"]["read"] == 5.0


def test_chat_omits_language_when_the_caller_does() -> None:
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(return_value=json_response(200, CHAT))
        client, _sleeps = sync_client()
        client.chat(messages=USER)
        client.close()
    assert "language" not in json.loads(route.calls.last.request.content)


def test_chat_stream_yields_deltas_until_done() -> None:
    body = sse(
        ": keep-alive\n\n",
        chat_event("San"),
        chat_event("nu"),
        chat_event("", finish="stop"),
        chat_event("", usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}),
        "data: [DONE]\n\n",
        chat_event("ignored"),
    )
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(
            return_value=httpx.Response(
                200,
                text=body,
                headers={"content-type": "text/event-stream"},
            )
        )
        client, _sleeps = sync_client()
        deltas: list[str] = []
        finish = None
        usage = None
        for chunk in client.chat(messages=USER, language="ha", stream=True):
            if chunk.delta:
                deltas.append(chunk.delta)
            if chunk.finish_reason:
                finish = chunk.finish_reason
            if chunk.usage is not None:
                usage = chunk.usage
        client.close()
    assert "".join(deltas) == "Sannu"
    assert finish == "stop"
    assert usage is not None
    assert usage.total_tokens == 5


def test_rejects_a_non_ncair_model_before_the_network() -> None:
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(return_value=json_response(200, CHAT))
        client, _sleeps = sync_client()
        with pytest.raises(BadRequestError):
            client.chat(messages=USER, model="gpt-4o")
        client.close()
        assert route.call_count == 0


def test_rejects_empty_messages() -> None:
    client, _sleeps = sync_client()
    with pytest.raises(BadRequestError):
        client.chat(messages=[])
    client.close()


@pytest.mark.parametrize(
    ("status", "payload", "expected"),
    [
        (401, {"detail": "Missing or invalid API key."}, AuthError),
        (403, {"error": {"message": "forbidden"}}, AuthError),
        (400, {"detail": [{"msg": "language is required"}]}, BadRequestError),
        (429, {"error": {"message": "slow down"}}, RateLimitError),
        (500, {"error": {"message": "vllm down"}}, ServerError),
        (502, {"detail": "upstream unavailable"}, ServerError),
        (408, {"detail": "timed out"}, TimeoutError),
    ],
)
def test_http_status_maps_to_a_typed_error(
    status: int,
    payload: dict[str, object],
    expected: type,
) -> None:
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(
            return_value=json_response(status, payload, **{"x-request-id": "req-9"})
        )
        client, _sleeps = sync_client(max_retries=0)
        with pytest.raises(expected) as caught:
            client.chat(messages=USER)
        client.close()
    assert caught.value.status == status
    assert caught.value.request_id == "req-9"
    assert str(caught.value)


def test_rate_limit_reads_retry_after() -> None:
    with respx.mock:
        respx.get(f"{API}/models").mock(
            side_effect=[
                json_response(429, {"detail": "slow"}, **{"retry-after": "2"}),
                json_response(200, MODELS),
            ]
        )
        client, sleeps = sync_client()
        models = client.list_models()
        client.close()
    assert models.data[0].id == "NCAIR1/N-ATLaS"
    assert sleeps == [2.0]


def test_idempotent_get_retries_server_errors_with_backoff() -> None:
    with respx.mock:
        route = respx.get(f"{API}/models").mock(
            side_effect=[
                json_response(503, {"detail": "busy"}),
                json_response(500, {"detail": "still busy"}),
                json_response(200, MODELS),
            ]
        )
        client, sleeps = sync_client()
        client.list_models()
        client.close()
    assert route.call_count == 3
    assert sleeps == [0.2, 0.4]


def test_chat_is_not_retried_unless_the_caller_opts_in() -> None:
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(
            return_value=json_response(500, {"detail": "boom"})
        )
        client, sleeps = sync_client()
        with pytest.raises(ServerError):
            client.chat(messages=USER)
        assert route.call_count == 1
        assert sleeps == []

        route.side_effect = [
            json_response(500, {"detail": "boom"}),
            json_response(200, CHAT),
        ]
        result = client.chat(messages=USER, max_retries=1)
        client.close()
    assert result.content == "Sannu da zuwa"
    assert sleeps == [0.2]


def test_retry_non_idempotent_retries_chat() -> None:
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(
            side_effect=[
                json_response(502, {"detail": "upstream"}),
                json_response(200, CHAT),
            ]
        )
        client, sleeps = sync_client(retry_non_idempotent=True, max_retries=1)
        result = client.chat(messages=USER)
        client.close()
    assert result.content == "Sannu da zuwa"
    assert sleeps == [0.2]


def test_auth_errors_are_not_retried() -> None:
    with respx.mock:
        route = respx.get(f"{API}/models").mock(
            return_value=json_response(401, {"detail": "Missing or invalid API key."})
        )
        client, sleeps = sync_client()
        with pytest.raises(AuthError, match="API key"):
            client.list_models()
        client.close()
    assert route.call_count == 1
    assert sleeps == []


def test_network_and_timeout_errors_retry_on_gets() -> None:
    with respx.mock:
        route = respx.get(f"{API}/models").mock(
            side_effect=[
                httpx.ConnectError("refused"),
                httpx.ReadTimeout("slow"),
                json_response(200, MODELS),
            ]
        )
        client, sleeps = sync_client()
        models = client.list_models()
        client.close()
    assert models.data[0].owned_by == "ncair"
    assert route.call_count == 3
    assert sleeps == [0.2, 0.4]


def test_timeout_is_raised_when_retries_are_exhausted() -> None:
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(side_effect=httpx.ReadTimeout("slow"))
        client, _sleeps = sync_client()
        with pytest.raises(TimeoutError, match="timed out"):
            client.chat(messages=USER, timeout=0.25, max_retries=1)
        client.close()


def test_connect_error_becomes_network_error() -> None:
    with respx.mock:
        respx.post(f"{API}/chat/completions").mock(side_effect=httpx.ConnectError("down"))
        client, _sleeps = sync_client(max_retries=0)
        with pytest.raises(NetworkError, match="ConnectError"):
            client.chat(messages=USER)
        client.close()


def test_invalid_json_is_a_server_error() -> None:
    with respx.mock:
        respx.get(f"{API}/models").mock(
            return_value=httpx.Response(
                200,
                text="not-json",
                headers={"content-type": "application/json"},
            )
        )
        client, _sleeps = sync_client(max_retries=0)
        with pytest.raises(ServerError, match="invalid JSON"):
            client.list_models()
        client.close()


def test_list_models_and_health() -> None:
    with respx.mock:
        respx.get(f"{API}/models").mock(return_value=json_response(200, MODELS))
        respx.get(f"{BASE}/health").mock(return_value=json_response(200, HEALTH_OK))
        client, _sleeps = sync_client()
        models = client.list_models()
        health = client.health()
        client.close()
    assert [item.id for item in models.data] == ["NCAIR1/N-ATLaS", "NCAIR1/Hausa-ASR"]
    assert health.ok is True
    assert health.status == "ok"
    assert health.version == "0.0.0"


def test_degraded_health_is_returned_not_raised() -> None:
    with respx.mock:
        respx.get(f"{BASE}/health").mock(
            return_value=json_response(503, {**HEALTH_OK, "status": "degraded"})
        )
        client, _sleeps = sync_client()
        health = client.health()
        client.close()
    assert health.ok is False
    assert health.status == "degraded"


def test_base_url_without_v1_suffix() -> None:
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(return_value=json_response(200, CHAT))
        client, _sleeps = sync_client(base_url=BASE)
        client.chat(messages=USER)
        client.close()
    assert str(route.calls.last.request.url) == f"{API}/chat/completions"


def test_per_call_timeout_overrides_the_client() -> None:
    with respx.mock:
        route = respx.get(f"{API}/models").mock(return_value=json_response(200, MODELS))
        client, _sleeps = sync_client()
        client.list_models(timeout=1.25)
        client.close()
    assert route.calls.last.request.extensions["timeout"]["read"] == 1.25


@pytest.mark.parametrize(
    ("language", "alias"),
    [("ha", "hausa"), ("ig", "Igbo"), ("yo", "Yorùbá"), ("en", "Nigerian English")],
)
def test_transcribe_each_language(language: str, alias: str) -> None:
    with respx.mock:
        route = respx.post(f"{API}/audio/transcriptions").mock(
            return_value=json_response(
                200,
                {"text": "sannu", "model": ASR_MODEL_IDS[language]},  # type: ignore[index]
            )
        )
        client, _sleeps = sync_client()
        heard = client.transcribe(audio=b"RIFF-audio", language=alias, filename="note.ogg")
        client.close()
    assert heard.text == "sannu"
    assert heard.language == language
    content = route.calls.last.request.content
    assert b'name="language"' in content
    assert language.encode() in content
    assert b"note.ogg" in content
    assert b"RIFF-audio" in content


def test_transcribe_path_bytes_and_file_object(tmp_path: Path) -> None:
    audio_path = tmp_path / "note.wav"
    audio_path.write_bytes(b"wav-bytes")
    with respx.mock:
        respx.post(f"{API}/audio/transcriptions").mock(
            return_value=json_response(200, {"text": "from file"})
        )
        client, _sleeps = sync_client()
        from_path = client.transcribe(audio=audio_path, language="yo")
        from_bytes = client.transcribe(audio=bytearray(b"abc"), language="ig", filename="a.mp3")
        with audio_path.open("rb") as handle:
            from_file = client.transcribe(audio=handle, language="en")
        client.close()
    assert from_path.text == "from file"
    assert from_path.language == "yo"
    assert from_bytes.language == "ig"
    assert from_file.language == "en"


def test_transcribe_verbose_json_and_plain_text() -> None:
    with respx.mock:
        respx.post(f"{API}/audio/transcriptions").mock(
            side_effect=[
                json_response(
                    200,
                    {
                        "text": "ndewo",
                        "task": "transcribe",
                        "language": "ig",
                        "duration": 1.5,
                        "model": "NCAIR1/Igbo-ASR",
                        "chunks": 1,
                    },
                ),
                httpx.Response(200, text="plain transcript"),
            ]
        )
        client, _sleeps = sync_client()
        verbose = client.transcribe(audio=b"x", language="ig", response_format="verbose_json")
        plain = client.transcribe(audio=b"x", language="ha", response_format="text")
        client.close()
    assert verbose.duration == 1.5
    assert verbose.chunks == 1
    assert verbose.model == "NCAIR1/Igbo-ASR"
    assert plain.text == "plain transcript"
    assert plain.language == "ha"


def test_transcribe_rejects_empty_audio_and_bad_language() -> None:
    client, _sleeps = sync_client()
    with pytest.raises(BadRequestError, match="empty"):
        client.transcribe(audio=b"", language="ha")
    with pytest.raises(BadRequestError):
        client.transcribe(audio=b"x", language="fr")
    with pytest.raises(BadRequestError):
        client.transcribe(audio=b"x", language="ha", response_format="srt")
    client.close()


def test_bad_request_is_not_retried() -> None:
    with respx.mock:
        route = respx.post(f"{API}/audio/transcriptions").mock(
            return_value=json_response(400, {"detail": "language is required"})
        )
        client, sleeps = sync_client()
        with pytest.raises(BadRequestError):
            client.transcribe(audio=b"x", language="ha", max_retries=3)
        client.close()
    assert route.call_count == 1
    assert sleeps == []


def test_translate_summarize_and_detect() -> None:
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(
            side_effect=[
                json_response(200, {**CHAT, "choices": [_choice("Ẹ káàrọ̀")]}),
                json_response(200, {**CHAT, "choices": [_choice("Nchịkọta.")]}),
                json_response(200, {**CHAT, "choices": [_choice("The language is Yoruba.")]}),
                json_response(200, {**CHAT, "choices": [_choice("not sure")]}),
            ]
        )
        client, _sleeps = sync_client()
        translated = client.translate(text="Good morning", from_="en", to="yo")
        summary = client.summarize(text="A long note about the market.", language="ig")
        detected = client.detect_language("Bawo ni?")
        unknown = client.detect_language("12345 ???")
        client.close()
    assert translated.text == "Ẹ káàrọ̀"
    assert translated.source == "en"
    assert translated.target == "yo"
    assert translated.model == "NCAIR1/N-ATLaS"
    assert summary.language == "ig"
    assert summary.text == "Nchịkọta."
    assert detected.language == "yo"
    assert unknown.language is None
    bodies = [json.loads(call.request.content) for call in route.calls]
    assert bodies[0]["temperature"] == 0.2
    assert bodies[0]["max_tokens"] == 1024
    assert bodies[0]["language"] == "yo"
    assert "Yoruba" in bodies[0]["messages"][0]["content"]
    assert bodies[1]["language"] == "ig"
    assert bodies[2]["temperature"] == 0
    assert bodies[2]["max_tokens"] == 16
    assert all(body["model"] == "NCAIR1/N-ATLaS" for body in bodies)


def test_same_language_translation_is_rejected() -> None:
    client, _sleeps = sync_client()
    with pytest.raises(BadRequestError, match="different"):
        client.translate(text="Sannu", from_="ha", to="hausa")
    client.close()


def test_voice_chat_chains_transcription_and_chat() -> None:
    with respx.mock:
        respx.post(f"{API}/audio/transcriptions").mock(
            return_value=json_response(200, {"text": "Ina kwana"})
        )
        route = respx.post(f"{API}/chat/completions").mock(
            return_value=json_response(200, {**CHAT, "choices": [_choice("Lafiya lau")]})
        )
        client, _sleeps = sync_client()
        result = client.voice_chat(audio=b"ogg", language="ha", instruction="Reply in Hausa.")
        client.close()
    assert result.transcript == "Ina kwana"
    assert result.reply == "Lafiya lau"
    assert result.language == "ha"
    body = json.loads(route.calls.last.request.content)
    assert body["messages"][1]["content"] == "Ina kwana"
    assert "Reply in Hausa." in body["messages"][0]["content"]


def test_voice_chat_refuses_an_empty_transcript() -> None:
    with respx.mock:
        respx.post(f"{API}/audio/transcriptions").mock(
            return_value=json_response(200, {"text": "   "})
        )
        chat = respx.post(f"{API}/chat/completions").mock(return_value=json_response(200, CHAT))
        client, _sleeps = sync_client()
        with pytest.raises(BadRequestError, match="empty"):
            client.voice_chat(audio=b"ogg", language="ha")
        client.close()
    assert chat.call_count == 0


def test_closed_client_refuses_further_calls() -> None:
    client, _sleeps = sync_client()
    with client:
        assert isinstance(client, NAtlas)
    with pytest.raises(NAtlasError, match="closed"):
        client.list_models()


def test_config_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATLAS_BASE_URL", f"{BASE}/v1/")
    monkeypatch.setenv("NATLAS_API_KEY", "from-env")
    monkeypatch.setenv("NATLAS_TIMEOUT_MS", "1500")
    monkeypatch.setenv("NATLAS_MAX_RETRIES", "0")
    monkeypatch.setenv("NATLAS_MODEL", "NCAIR1/N-ATLaS")
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(return_value=json_response(200, CHAT))
        client = NAtlas()
        client.chat(messages=USER)
        client.close()
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer from-env"
    assert request.extensions["timeout"]["read"] == 1.5


def test_constructor_overrides_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATLAS_BASE_URL", "http://env.example/v1")
    monkeypatch.setenv("NATLAS_API_KEY", "from-env")
    with respx.mock:
        route = respx.post(f"{API}/chat/completions").mock(return_value=json_response(200, CHAT))
        client, _sleeps = sync_client(api_key="from-ctor")
        client.chat(messages=USER)
        client.close()
    assert route.calls.last.request.headers["authorization"] == "Bearer from-ctor"


def test_missing_base_url_and_bad_config() -> None:
    with pytest.raises(NAtlasError, match="NATLAS_BASE_URL"):
        NAtlas()
    with pytest.raises(BadRequestError, match="http"):
        NAtlas(base_url="ftp://natlas.test", api_key="k")
    with pytest.raises(BadRequestError, match="invalid characters"):
        NAtlas(base_url=API, api_key="bad\nkey")
    with pytest.raises(NAtlasError, match="official"):
        NAtlas(base_url=API, api_key="k", backend="official")
    with pytest.raises(NAtlasError, match="local"):
        NAtlas(base_url=API, api_key="k", backend="local")
    with pytest.raises(BadRequestError, match="backend"):
        NAtlas(base_url=API, api_key="k", backend="mystery")


def test_hf_endpoint_uses_the_same_wire_protocol() -> None:
    with respx.mock:
        route = respx.post("https://endpoint.example/v1/chat/completions").mock(
            return_value=json_response(200, CHAT)
        )
        client = NAtlas(
            base_url="https://endpoint.example",
            api_key="hf",
            backend="hf-endpoint",
            sleep=lambda _seconds: None,
            rng=lambda: 0.0,
        )
        result = client.chat(messages=USER)
        client.close()
    assert result.content == "Sannu da zuwa"
    assert route.called


def _choice(text: str) -> dict[str, object]:
    return {"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
