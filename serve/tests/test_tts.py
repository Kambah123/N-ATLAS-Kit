"""Speech endpoint and WAV encoding. No model download."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from natlas_serve.gateway import create_app
from natlas_serve.tts import (
    SpeechClip,
    SpeechError,
    pcm_to_wav,
    prepare_speech_text,
    voice_for,
)

AUTH = {"Authorization": "Bearer test-key"}


class StubSpeaker:
    def synthesize(self, text: str, language: str) -> SpeechClip:
        spoken = prepare_speech_text(text)
        voice, note = voice_for(language)
        wav = pcm_to_wav(np.linspace(-0.2, 0.2, 160, dtype=np.float32), 16_000)
        assert spoken
        return SpeechClip(wav=wav, sample_rate=16_000, voice=voice, note=note)


def test_pcm_to_wav_is_a_mono_riff() -> None:
    wav = pcm_to_wav(np.array([0.0, 0.5, -0.5], dtype=np.float32), 16_000)
    assert wav.startswith(b"RIFF")
    assert b"WAVE" in wav[:16]


def test_pidgin_uses_the_english_voice_and_says_so() -> None:
    voice, note = voice_for("pidgin")
    assert voice == "en"
    assert note is not None
    assert "Pidgin" in note


def test_speech_requires_a_speaker(settings) -> None:
    with TestClient(create_app(settings)) as test_client:
        response = test_client.post(
            "/v1/audio/speech",
            json={"input": "Sannu", "language": "ha"},
            headers=AUTH,
        )
    assert response.status_code == 501
    assert "Redeploy" in response.json()["detail"]


def test_speech_requires_auth(settings) -> None:
    with TestClient(create_app(settings, speaker=StubSpeaker())) as test_client:
        response = test_client.post("/v1/audio/speech", json={"input": "Sannu", "language": "ha"})
    assert response.status_code == 401


def test_speech_returns_wav_and_a_pidgin_note(settings) -> None:
    with TestClient(create_app(settings, speaker=StubSpeaker())) as test_client:
        hausa = test_client.post(
            "/v1/audio/speech",
            json={"input": "Sannu", "language": "ha"},
            headers=AUTH,
        )
        pidgin = test_client.post(
            "/v1/audio/speech",
            json={"text": "How you dey", "language": "pcm"},
            headers=AUTH,
        )
    assert hausa.status_code == 200
    assert hausa.headers["content-type"].startswith("audio/wav")
    assert hausa.headers["x-natlas-voice"] == "ha"
    assert hausa.content.startswith(b"RIFF")
    assert "x-natlas-voice-note" not in hausa.headers
    assert pidgin.status_code == 200
    assert pidgin.headers["x-natlas-voice"] == "en"
    assert "Pidgin" in pidgin.headers["x-natlas-voice-note"]


def test_speech_rejects_an_empty_clip(settings) -> None:
    class Empty:
        def synthesize(self, text: str, language: str) -> SpeechClip:
            raise ValueError("There is nothing to read out.")

    with TestClient(create_app(settings, speaker=Empty())) as test_client:
        response = test_client.post(
            "/v1/audio/speech",
            json={"input": "   ", "language": "en"},
            headers=AUTH,
        )
    assert response.status_code == 400


def test_speech_reports_a_missing_voice_library(settings) -> None:
    class Broken:
        def synthesize(self, text: str, language: str) -> SpeechClip:
            del text, language
            raise SpeechError("The speech libraries are not installed in this environment.")

    with TestClient(create_app(settings, speaker=Broken())) as test_client:
        response = test_client.post(
            "/v1/audio/speech",
            json={"input": "Hello", "language": "en"},
            headers=AUTH,
        )
    assert response.status_code == 503
    assert "speech libraries" in response.json()["detail"]
