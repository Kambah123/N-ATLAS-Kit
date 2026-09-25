"""Gateway behaviour: auth, CORS, health, proxying, and the logging promise."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from natlas_serve import gateway
from natlas_serve.config import ConfigError, Settings
from natlas_serve.languages import ASR_MODEL_IDS

AUTH = {"Authorization": "Bearer test-key"}


@pytest.fixture
def client(settings: Settings):
    with respx.mock(assert_all_called=False) as mock:
        mock.get("http://vllm.test/health").mock(return_value=httpx.Response(200))
        mock.get("http://asr.test/health").mock(return_value=httpx.Response(200))
        with TestClient(gateway.create_app(settings)) as test_client:
            yield test_client, mock


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong-key"},
        {"Authorization": "test-key"},  # missing scheme
        {"Authorization": "Basic test-key"},  # wrong scheme
        {"Authorization": "Bearer "},  # empty token
    ],
)
def test_rejects_bad_credentials(client, headers: dict[str, str]) -> None:
    test_client, _ = client
    resp = test_client.post("/v1/chat/completions", json={"messages": []}, headers=headers)
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


def test_health_needs_no_credentials(client) -> None:
    test_client, _ = client
    assert test_client.get("/health").status_code == 200


def test_every_response_carries_a_request_id(client) -> None:
    test_client, _ = client
    assert test_client.get("/health").headers["X-Request-Id"]


def test_second_configured_key_also_works(settings: Settings) -> None:
    multi = Settings(
        api_keys=frozenset({"alpha", "beta"}),
        vllm_url=settings.vllm_url,
        asr_url=settings.asr_url,
    )
    assert gateway.is_authorised("beta", multi)
    assert not gateway.is_authorised("gamma", multi)


def test_refuses_to_start_with_no_keys() -> None:
    """Silently running wide open is worse than failing loudly."""
    with pytest.raises(ConfigError, match="refuses to start wide open"):
        Settings.from_env({})


def test_anonymous_mode_is_opt_in() -> None:
    anon = Settings.from_env({"NATLAS_ALLOW_ANONYMOUS": "true"})
    assert gateway.is_authorised(None, anon)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


def test_health_reports_both_upstreams_and_the_attribution(client) -> None:
    test_client, _ = client
    body = test_client.get("/health").json()
    assert body["status"] == "ok"
    assert body["llm"] == {"model": "NCAIR1/N-ATLaS", "status": "ok"}
    assert body["asr"]["status"] == "ok"
    assert body["asr"]["models"] == ASR_MODEL_IDS
    assert "Awarri Technologies" in body["attribution"]


def test_health_is_503_when_the_llm_is_down(settings: Settings) -> None:
    with respx.mock(assert_all_called=False) as mock:
        mock.get("http://vllm.test/health").mock(side_effect=httpx.ConnectError("refused"))
        mock.get("http://asr.test/health").mock(return_value=httpx.Response(200))
        with TestClient(gateway.create_app(settings)) as test_client:
            resp = test_client.get("/health")
    assert resp.status_code == 503
    assert resp.json()["status"] == "degraded"
    assert resp.json()["llm"]["status"] == "down"


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


def test_cors_allows_the_configured_origin(client) -> None:
    test_client, _ = client
    resp = test_client.options(
        "/v1/chat/completions",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_rejects_an_unlisted_origin(client) -> None:
    test_client, _ = client
    resp = test_client.options(
        "/v1/chat/completions",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in resp.headers


# ---------------------------------------------------------------------------
# Chat request shaping
# ---------------------------------------------------------------------------


def test_injects_the_date_string_the_chat_template_needs(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": []}, settings)
    expected = datetime.now(timezone.utc).strftime("%d %b %Y")
    assert body["chat_template_kwargs"]["date_string"] == expected


def test_date_string_format_matches_the_model_card_example() -> None:
    assert gateway.today_date_string(datetime(2026, 9, 24, tzinfo=timezone.utc)) == "24 Sep 2026"


def test_caller_supplied_chat_template_kwargs_win(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body(
        {"messages": [], "chat_template_kwargs": {"date_string": "01 Jan 2020"}}, settings
    )
    assert body["chat_template_kwargs"]["date_string"] == "01 Jan 2020"


def test_date_injection_can_be_switched_off() -> None:
    off = Settings(api_keys=frozenset({"k"}), inject_date_string=False)
    body, _ = gateway.prepare_chat_body({"messages": []}, off)
    assert "chat_template_kwargs" not in body


def test_language_is_stripped_from_the_body_but_kept_for_logging(settings: Settings) -> None:
    """vLLM would reject the unknown field, so it must not be forwarded."""
    body, language = gateway.prepare_chat_body({"messages": [], "language": "Hausa"}, settings)
    assert language == "ha"
    assert "language" not in body


def test_unknown_language_is_dropped_rather_than_failing(settings: Settings) -> None:
    body, language = gateway.prepare_chat_body({"messages": [], "language": "klingon"}, settings)
    assert language is None
    assert "language" not in body


def test_model_defaults_to_n_atlas(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": []}, settings)
    assert body["model"] == "NCAIR1/N-ATLaS"


def test_streaming_requests_ask_for_usage(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": [], "stream": True}, settings)
    assert body["stream_options"]["include_usage"] is True


def test_non_streaming_requests_do_not_get_stream_options(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": []}, settings)
    assert "stream_options" not in body


def test_temperature_above_one_is_clamped(settings: Settings) -> None:
    high, _ = gateway.prepare_chat_body({"messages": [], "temperature": 1.5}, settings)
    assert high["temperature"] == 1.0
    extreme, _ = gateway.prepare_chat_body({"messages": [], "temperature": 100}, settings)
    assert extreme["temperature"] == 1.0


def test_temperature_at_or_below_one_is_unchanged(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": [], "temperature": 0.4}, settings)
    assert body["temperature"] == 0.4
    at_cap, _ = gateway.prepare_chat_body({"messages": [], "temperature": 1}, settings)
    assert at_cap["temperature"] == 1


def test_non_numeric_temperature_is_left_alone(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": [], "temperature": True}, settings)
    assert body["temperature"] is True


def test_sampling_defaults_fill_in_when_missing(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body({"messages": []}, settings)
    assert "temperature" not in body
    assert body["top_p"] == 0.9
    assert body["repetition_penalty"] == 1.1


def test_caller_sampling_values_are_kept(settings: Settings) -> None:
    body, _ = gateway.prepare_chat_body(
        {"messages": [], "top_p": 0.5, "repetition_penalty": 1.3}, settings
    )
    assert body["top_p"] == 0.5
    assert body["repetition_penalty"] == 1.3


# ---------------------------------------------------------------------------
# Proxying
# ---------------------------------------------------------------------------


def test_forwards_a_chat_completion_and_returns_the_body(client) -> None:
    test_client, mock = client
    upstream = mock.post("http://vllm.test/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "chatcmpl-1",
                "choices": [{"message": {"role": "assistant", "content": "Sannu!"}}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 4, "total_tokens": 15},
            },
        )
    )
    resp = test_client.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "Sannu"}], "language": "ha"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"] == "Sannu!"

    sent = json.loads(upstream.calls.last.request.content)
    assert sent["model"] == "NCAIR1/N-ATLaS"
    assert "language" not in sent
    assert "date_string" in sent["chat_template_kwargs"]


def test_upstream_errors_are_passed_through(client) -> None:
    test_client, mock = client
    mock.post("http://vllm.test/v1/chat/completions").mock(
        return_value=httpx.Response(400, json={"error": "context length exceeded"})
    )
    resp = test_client.post("/v1/chat/completions", json={"messages": []}, headers=AUTH)
    assert resp.status_code == 400


def test_unreachable_llm_is_a_502_not_a_crash(client) -> None:
    test_client, mock = client
    mock.post("http://vllm.test/v1/chat/completions").mock(
        side_effect=httpx.ConnectError("refused")
    )
    resp = test_client.post("/v1/chat/completions", json={"messages": []}, headers=AUTH)
    assert resp.status_code == 502


def test_malformed_json_is_a_400(client) -> None:
    test_client, _ = client
    resp = test_client.post(
        "/v1/chat/completions",
        content=b"{not json",
        headers={**AUTH, "Content-Type": "application/json"},
    )
    assert resp.status_code == 400


def test_streams_server_sent_events_through_unchanged(client) -> None:
    test_client, mock = client
    sse = (
        b'data: {"choices":[{"delta":{"content":"Sannu"}}]}\n\n'
        b'data: {"choices":[{"delta":{"content":" da zuwa"}}]}\n\n'
        b'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":5,'
        b'"total_tokens":14}}\n\n'
        b"data: [DONE]\n\n"
    )
    mock.post("http://vllm.test/v1/chat/completions").mock(
        return_value=httpx.Response(200, content=sse, headers={"content-type": "text/event-stream"})
    )
    with test_client.stream(
        "POST",
        "/v1/chat/completions",
        json={"messages": [], "stream": True, "language": "ha"},
        headers=AUTH,
    ) as resp:
        assert resp.status_code == 200
        received = b"".join(resp.iter_bytes())

    assert received == sse, "the stream must reach the client byte-for-byte"


def test_models_endpoint_is_proxied(client) -> None:
    test_client, mock = client
    mock.get("http://vllm.test/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "NCAIR1/N-ATLaS"}]})
    )
    resp = test_client.get("/v1/models", headers=AUTH)
    assert resp.json()["data"][0]["id"] == "NCAIR1/N-ATLaS"


def test_transcription_is_proxied_when_asr_is_a_separate_service(client) -> None:
    test_client, mock = client
    mock.post("http://asr.test/v1/audio/transcriptions").mock(
        return_value=httpx.Response(200, json={"text": "sannu"})
    )
    resp = test_client.post(
        "/v1/audio/transcriptions",
        files={"file": ("a.ogg", b"xx", "audio/ogg")},
        data={"language": "ha"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "sannu"


# ---------------------------------------------------------------------------
# Usage scanning
# ---------------------------------------------------------------------------


def test_scan_usage_reads_token_counts_out_of_a_split_stream() -> None:
    """Usage must be found even when it straddles two network chunks."""
    buffer, usage = bytearray(), {}
    gateway.scan_usage(b'data: {"choices":[],"usage":{"prompt_tok', buffer, usage)
    assert usage == {}
    gateway.scan_usage(b'ens":7,"completion_tokens":3,"total_tokens":10}}\n', buffer, usage)
    assert usage == {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}


def test_scan_usage_ignores_content_deltas_and_junk() -> None:
    buffer, usage = bytearray(), {}
    gateway.scan_usage(b'data: {"choices":[{"delta":{"content":"hi"}}]}\n', buffer, usage)
    gateway.scan_usage(b"data: [DONE]\n", buffer, usage)
    gateway.scan_usage(b": keepalive comment\n", buffer, usage)
    gateway.scan_usage(b"data: {broken json\n", buffer, usage)
    assert usage == {}


def test_scan_usage_will_not_buffer_without_bound() -> None:
    buffer, usage = bytearray(), {}
    gateway.scan_usage(b"x" * (2 << 20), buffer, usage)
    assert len(buffer) == 0


# ---------------------------------------------------------------------------
# The logging promise
# ---------------------------------------------------------------------------


def test_logs_shape_and_tokens_but_never_content(client, caplog) -> None:
    """The load-bearing privacy test for the whole project."""
    test_client, mock = client
    secret = "Menene sirrin da ba ya kamata a rubuta a log ba"
    mock.post("http://vllm.test/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "wani amsa na sirri"}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 6, "total_tokens": 18},
            },
        )
    )

    with caplog.at_level(logging.INFO, logger="natlas.serve"):
        test_client.post(
            "/v1/chat/completions",
            json={"messages": [{"role": "user", "content": secret}], "language": "ha"},
            headers=AUTH,
        )

    lines = [r.message for r in caplog.records]
    assert lines, "nothing was logged"
    entry = json.loads(lines[-1])

    # What we DO record.
    assert entry["feature"] == "chat"
    assert entry["language"] == "ha"
    assert entry["status"] == 200
    assert entry["prompt_tokens"] == 12
    assert entry["completion_tokens"] == 6
    assert entry["model"] == "NCAIR1/N-ATLaS"
    assert entry["latency_ms"] >= 0

    # What we must NEVER record.
    blob = "\n".join(lines)
    assert secret not in blob
    assert "wani amsa na sirri" not in blob
    assert "test-key" not in blob
    assert entry["key"].startswith("k_"), "the key must be fingerprinted, not logged"
    for banned in ("messages", "content", "choices", "prompt", "text"):
        assert banned not in entry
