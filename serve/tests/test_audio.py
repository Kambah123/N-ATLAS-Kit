"""The audio pipeline, exercised against real encoded files.

These are not mocked. Every case here encodes actual audio with ffmpeg and
pushes the bytes through the same code path a WhatsApp voice note takes.
"""

from __future__ import annotations

import numpy as np
import pytest

from natlas_serve import audio

SR = audio.SAMPLE_RATE

FORMATS = {
    "wav-16k-mono": (["-ac", "1", "-ar", "16000", "-f", "wav"], ".wav"),
    "ogg-opus-48k-stereo": (["-ac", "2", "-ar", "48000", "-c:a", "libopus", "-f", "ogg"], ".ogg"),
    "mp3-44k-stereo": (["-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-f", "mp3"], ".mp3"),
    "flac-44k-mono": (["-ac", "1", "-ar", "44100", "-c:a", "flac", "-f", "flac"], ".flac"),
    "ogg-vorbis": (["-ac", "2", "-ar", "44100", "-c:a", "libvorbis", "-f", "ogg"], ".ogg"),
}


@pytest.mark.parametrize("name", sorted(FORMATS))
def test_decodes_every_format_to_16k_mono(encode, name: str) -> None:
    args, suffix = FORMATS[name]
    data = encode(args, seconds=5.0)

    samples = audio.decode_to_mono16k(data, filename=f"voice{suffix}")

    assert samples.dtype == np.int16
    assert samples.ndim == 1, "must be mono"
    # Lossy codecs pad by a few ms; anything within 100 ms is the same audio.
    assert abs(audio.duration_seconds(samples) - 5.0) < 0.1


def test_m4a_decodes_even_though_mp4_needs_a_seekable_input(tmp_path, ffmpeg_on_path) -> None:
    """The regression this guards: piping MP4 to ffmpeg stdin fails.

    iPhone voice memos are m4a. The moov atom sits at the end of the file, so
    ``ffmpeg -i pipe:0`` cannot decode it - which is why decode_to_mono16k
    writes to a temp file instead. If someone "optimises" that away, this test
    is what catches it.
    """
    import subprocess

    target = tmp_path / "memo.m4a"
    subprocess.run(
        [
            ffmpeg_on_path, "-nostdin", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=5",
            "-c:a", "aac", "-f", "mp4", str(target), "-y",
        ],
        check=True,
        capture_output=True,
    )  # fmt: skip

    samples = audio.decode_to_mono16k(target.read_bytes(), filename="memo.m4a")
    assert abs(audio.duration_seconds(samples) - 5.0) < 0.1


def test_decodes_without_a_filename_hint(encode) -> None:
    data = encode(["-ac", "2", "-ar", "48000", "-c:a", "libopus", "-f", "ogg"], seconds=2.0)
    samples = audio.decode_to_mono16k(data)
    assert abs(audio.duration_seconds(samples) - 2.0) < 0.1


def test_absurd_extension_is_ignored(encode) -> None:
    data = encode(["-ac", "1", "-ar", "16000", "-f", "wav"], seconds=1.0)
    samples = audio.decode_to_mono16k(data, filename="x" + ".y" * 40)
    assert samples.size > 0


@pytest.mark.parametrize(
    ("payload", "match"),
    [
        (b"", "Empty audio"),
        (b"this is definitely not audio" * 20, "Could not decode"),
    ],
)
def test_rejects_undecodable_input(payload: bytes, match: str) -> None:
    with pytest.raises(audio.AudioError, match=match):
        audio.decode_to_mono16k(payload)


def test_missing_ffmpeg_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NATLAS_FFMPEG_BINARY", raising=False)
    monkeypatch.setattr(audio.shutil, "which", lambda _: None)
    with pytest.raises(audio.AudioError, match="ffmpeg not found"):
        audio.ffmpeg_binary()


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("seconds", [0.05, 1.0, 15.0, 29.9, 30.0])
def test_short_audio_is_one_chunk(tone, seconds: float) -> None:
    assert len(audio.split_audio(tone(seconds))) == 1


def test_empty_audio_splits_to_nothing() -> None:
    assert audio.split_audio(np.array([], dtype=np.int16)) == []


@pytest.mark.parametrize("seconds", [30.1, 45.0, 70.0, 185.0])
def test_no_chunk_ever_exceeds_the_whisper_window(tone, seconds: float) -> None:
    """The 30 s ceiling is a hard model constraint, not a preference."""
    for chunk in audio.split_audio(tone(seconds)):
        assert len(chunk) / SR <= audio.MAX_SEGMENT_SECONDS + 1e-6


@pytest.mark.parametrize("seconds", [30.1, 70.0, 185.0])
def test_splitting_is_lossless(tone, seconds: float) -> None:
    original = tone(seconds)
    rejoined = np.concatenate(audio.split_audio(original))
    assert np.array_equal(rejoined, original), "audio was dropped or duplicated"


def test_cuts_land_inside_pauses(tone) -> None:
    """A 70 s clip with pauses at 24-27 s and 50-53 s must be cut in them."""
    pauses = [(24.0, 27.0), (50.0, 53.0)]
    chunks = audio.split_audio(tone(70.0, pauses))

    boundaries: list[float] = []
    position = 0
    for chunk in chunks[:-1]:
        position += len(chunk)
        boundaries.append(position / SR)

    assert len(boundaries) >= 1
    for cut in boundaries:
        assert any(start <= cut <= end for start, end in pauses), (
            f"cut at {cut:.2f}s fell in the middle of speech"
        )


def test_unbroken_speech_cuts_at_the_target_not_the_noise_floor(tone) -> None:
    """With no real pause, argmin over RMS is noise. Cut at the target instead."""
    chunks = audio.split_audio(tone(70.0), chunk_seconds=25.0)
    assert abs(len(chunks[0]) / SR - 25.0) < 0.5


def test_chunk_length_is_configurable(tone) -> None:
    """A smaller target yields more, shorter chunks.

    The tail is still allowed to run to the full 30 s window - once the
    remainder fits in one forward pass there is nothing to gain by splitting it
    further, and a lot to lose in extra model calls.
    """
    clip = tone(60.0)
    few = audio.split_audio(clip, chunk_seconds=25.0)
    many = audio.split_audio(clip, chunk_seconds=10.0)

    assert len(many) > len(few)
    assert len(many[0]) / SR == pytest.approx(10.0, abs=0.5)
    for chunks in (few, many):
        assert all(len(c) / SR <= audio.MAX_SEGMENT_SECONDS + 1e-6 for c in chunks)
        assert np.array_equal(np.concatenate(chunks), clip)


def test_prepare_returns_chunks_and_true_duration(encode) -> None:
    data = encode(["-ac", "2", "-ar", "48000", "-c:a", "libopus", "-f", "ogg"], seconds=65.0)
    chunks, duration = audio.prepare(data, filename="voice-note.ogg")
    assert abs(duration - 65.0) < 0.2
    assert len(chunks) >= 3
    assert all(len(c) / SR <= audio.MAX_SEGMENT_SECONDS for c in chunks)


# ---------------------------------------------------------------------------
# Float conversion
# ---------------------------------------------------------------------------


def test_to_float32_normalises_into_whisper_range() -> None:
    out = audio.to_float32(np.array([-32768, -1, 0, 1, 32767], dtype=np.int16))
    assert out.dtype == np.float32
    assert out.min() >= -1.0
    assert out.max() <= 1.0
    assert out[2] == 0.0


def test_frame_rms_handles_a_window_shorter_than_one_frame() -> None:
    assert audio._frame_rms(np.zeros(3, dtype=np.int16), 100).size == 0
