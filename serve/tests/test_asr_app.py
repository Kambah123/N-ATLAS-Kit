"""The transcription endpoint, with the Whisper models stubbed out.

The real models need a GPU and gated weights, so the *model* is stubbed. The
routing, validation, ffmpeg decoding and chunking are all real.
"""

from __future__ import annotations

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from natlas_serve.asr_app import build_router
from natlas_serve.config import Settings


@pytest.fixture
def client(settings: Settings, stub_transcriber):
    app = FastAPI()
    app.include_router(build_router(settings, stub_transcriber))
    return TestClient(app), stub_transcriber


@pytest.fixture
def voice_note(encode):
    """A 5-second Ogg/Opus clip - the shape WhatsApp actually sends."""
    return encode(["-ac", "1", "-ar", "48000", "-c:a", "libopus", "-f", "ogg"], seconds=5.0)


def post(test_client, audio_bytes: bytes, **form: str):
    return test_client.post(
        "/v1/audio/transcriptions",
        files={"file": ("voice.ogg", audio_bytes, "audio/ogg")},
        data=form,
    )


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("language", "expected_model"),
    [
        ("ha", "NCAIR1/Hausa-ASR"),
        ("ig", "NCAIR1/Igbo-ASR"),
        ("yo", "NCAIR1/Yoruba-ASR"),
        ("en", "NCAIR1/NigerianAccentedEnglish"),
    ],
)
def test_each_language_routes_to_its_own_ncair1_model(
    client,
    voice_note: bytes,
    language: str,
    expected_model: str,
) -> None:
    test_client, stub = client
    resp = post(test_client, voice_note, language=language, response_format="verbose_json")

    assert resp.status_code == 200
    assert resp.json()["model"] == expected_model
    assert stub.calls[0][1] == language


@pytest.mark.parametrize("alias", ["ha", "HA", "hau", "Hausa", " hausa "])
def test_language_aliases_are_accepted(client, voice_note: bytes, alias: str) -> None:
    test_client, _ = client
    resp = post(test_client, voice_note, language=alias, response_format="verbose_json")
    assert resp.status_code == 200
    assert resp.json()["language"] == "ha"


@pytest.mark.parametrize("bad", ["fr", "swahili", "", "xx"])
def test_unsupported_languages_get_a_helpful_400(client, voice_note: bytes, bad: str) -> None:
    test_client, _ = client
    resp = post(test_client, voice_note, language=bad)
    assert resp.status_code in (400, 422)
    if resp.status_code == 400:
        assert "ha, ig, yo, en" in resp.json()["detail"]


def test_language_is_required(client, voice_note: bytes) -> None:
    test_client, _ = client
    resp = test_client.post(
        "/v1/audio/transcriptions",
        files={"file": ("voice.ogg", voice_note, "audio/ogg")},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Response formats
# ---------------------------------------------------------------------------


def test_json_is_openai_shaped(client, voice_note: bytes) -> None:
    test_client, _ = client
    body = post(test_client, voice_note, language="ha").json()
    assert set(body) == {"text"}
    assert body["text"]


def test_verbose_json_adds_duration_model_and_chunks(client, voice_note: bytes) -> None:
    test_client, _ = client
    body = post(test_client, voice_note, language="ha", response_format="verbose_json").json()
    assert body["task"] == "transcribe"
    assert body["language"] == "ha"
    assert abs(body["duration"] - 5.0) < 0.2
    assert body["chunks"] == 1


def test_text_format_returns_plain_text(client, voice_note: bytes) -> None:
    test_client, _ = client
    resp = post(test_client, voice_note, language="ha", response_format="text")
    assert resp.headers["content-type"].startswith("text/plain")
    assert resp.text


def test_bad_response_format_is_rejected(client, voice_note: bytes) -> None:
    test_client, _ = client
    resp = post(test_client, voice_note, language="ha", response_format="srt")
    assert resp.status_code == 400


def test_openai_model_field_is_accepted_and_ignored(client, voice_note: bytes) -> None:
    """Drop-in compatibility: OpenAI clients always send `model`."""
    test_client, _ = client
    resp = post(test_client, voice_note, language="ha", model="whisper-1")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Long audio
# ---------------------------------------------------------------------------


def test_long_voice_notes_are_chunked_and_stitched(client, encode) -> None:
    """A 70 s note exceeds Whisper's 30 s window, so it must arrive in pieces."""
    test_client, stub = client
    long_note = encode(["-ac", "1", "-ar", "48000", "-c:a", "libopus", "-f", "ogg"], seconds=70.0)

    resp = post(test_client, long_note, language="ha", response_format="verbose_json")
    body = resp.json()

    assert resp.status_code == 200
    assert body["chunks"] >= 3
    assert len(stub.calls) == body["chunks"]
    for samples, _ in stub.calls:
        assert samples / 16_000 <= 30.0 + 1e-6, "a chunk exceeded the model's window"
    # Every chunk's text ends up in the joined transcript.
    assert body["text"].count("[ha:") == body["chunks"]


# ---------------------------------------------------------------------------
# Failure modes
# ---------------------------------------------------------------------------


def test_undecodable_audio_is_a_400(client) -> None:
    test_client, _ = client
    resp = post(test_client, b"definitely not audio" * 20, language="ha")
    assert resp.status_code == 400
    assert "decode" in resp.json()["detail"].lower()


def test_oversized_upload_is_a_413(settings: Settings, stub_transcriber, voice_note) -> None:
    tiny = Settings(
        api_keys=settings.api_keys,
        asr_models=settings.asr_models,
        max_upload_bytes=10,
    )
    app = FastAPI()
    app.include_router(build_router(tiny, stub_transcriber))
    resp = post(TestClient(app), voice_note, language="ha")
    assert resp.status_code == 413


def test_model_failure_is_a_500_that_leaks_nothing(client, voice_note: bytes) -> None:
    test_client, stub = client
    stub.fail_with = RuntimeError("CUDA out of memory at 0xdeadbeef")

    resp = post(test_client, voice_note, language="ha")

    assert resp.status_code == 500
    assert "0xdeadbeef" not in resp.text, "internal detail leaked to the caller"
    assert "RuntimeError" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def test_logs_duration_and_chunks_but_never_the_transcript(client, voice_note, caplog) -> None:
    test_client, stub = client
    stub.text = "wannan sirri ne"

    with caplog.at_level(logging.INFO, logger="natlas.serve"):
        post(test_client, voice_note, language="ha")

    entry = json.loads(caplog.records[-1].message)
    assert entry["feature"] == "transcription"
    assert entry["language"] == "ha"
    assert entry["model"] == "NCAIR1/Hausa-ASR"
    assert entry["audio_chunks"] == 1
    assert abs(entry["audio_seconds"] - 5.0) < 0.2
    assert "wannan sirri ne" not in "\n".join(r.message for r in caplog.records)
