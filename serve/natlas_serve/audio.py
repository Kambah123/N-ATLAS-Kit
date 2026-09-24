"""Audio ingestion for the N-ATLaS ASR server.

The four NCAIR1 ASR models are Whisper Small fine-tunes, which imposes two hard
constraints every caller would otherwise have to discover the hard way:

* input must be **16 kHz mono**
* one forward pass sees at most **30 seconds**

Real users do not send 16 kHz mono WAV. They send WhatsApp voice notes, which
are Ogg/Opus at 48 kHz and routinely two or three minutes long. This module is
the bridge: decode anything ffmpeg understands, resample to 16 kHz mono, and
split long audio **at the quietest point near each boundary** so we never cut a
word in half.

Why silence-aware splitting rather than fixed 30 s slices with overlap: fixed
slices reliably guillotine a word, and overlap then needs fuzzy text
de-duplication to clean up, which is its own source of bugs. Cutting in a
natural pause avoids both problems, and costs one pass of RMS over a four
second search window.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

#: Sample rate the Whisper Small encoders expect.
SAMPLE_RATE = 16_000

#: Hard ceiling for one forward pass.
MAX_SEGMENT_SECONDS = 30.0

#: Where we aim to cut. Leaves headroom under the 30 s ceiling so the search
#: window can drift later without overshooting.
DEFAULT_CHUNK_SECONDS = 25.0

#: How far either side of the target we hunt for a quiet moment.
SEARCH_SECONDS = 4.0

#: RMS is measured over 20 ms frames, the usual granularity for speech energy.
FRAME_SECONDS = 0.02

#: A candidate frame counts as a real pause only if its energy is below this
#: fraction of the median energy in the search window. Stops us "finding" a
#: pause in unbroken speech and shortening every chunk for nothing.
PAUSE_RATIO = 0.5


class AudioError(ValueError):
    """Raised when audio cannot be decoded."""


def ffmpeg_binary() -> str:
    """Locate ffmpeg.

    Honours ``NATLAS_FFMPEG_BINARY`` so tests (and anyone without a system
    ffmpeg) can point at a static build.
    """
    override = os.environ.get("NATLAS_FFMPEG_BINARY")
    if override:
        return override
    found = shutil.which("ffmpeg")
    if not found:
        raise AudioError(
            "ffmpeg not found on PATH. The ASR server needs it to decode "
            "voice notes. Install it (apt-get install ffmpeg) or set "
            "NATLAS_FFMPEG_BINARY."
        )
    return found


def decode_to_mono16k(data: bytes, *, filename: str | None = None) -> np.ndarray:
    """Decode arbitrary audio bytes to 16 kHz mono signed-16-bit PCM.

    Handles ogg/opus (WhatsApp voice notes), mp3, m4a/mp4, wav, webm, flac -
    anything the ffmpeg build supports.

    The bytes go through a temporary **file**, not a pipe. MP4/M4A containers
    put their moov atom at the end and need a seekable input; piping them to
    ``ffmpeg -i pipe:0`` fails on exactly the files iPhone users send.
    """
    if not data:
        raise AudioError("Empty audio upload.")

    suffix = Path(filename).suffix if filename else ""
    if len(suffix) > 10:  # nonsense extension, let ffmpeg sniff instead
        suffix = ""

    binary = ffmpeg_binary()
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        proc = subprocess.run(
            [
                binary,
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                tmp_path,
                "-vn",
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "-ac",
                "1",
                "-ar",
                str(SAMPLE_RATE),
                "-",
            ],
            capture_output=True,
            check=False,
        )
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)

    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        reason = detail[-1] if detail else f"ffmpeg exited {proc.returncode}"
        raise AudioError(f"Could not decode audio: {reason}")

    samples = np.frombuffer(proc.stdout, dtype=np.int16)
    if samples.size == 0:
        raise AudioError("No decodable audio stream in the upload.")
    return samples


def duration_seconds(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float:
    """Exact duration of decoded PCM. No ffprobe round-trip needed."""
    return round(len(samples) / sample_rate, 3)


def _frame_rms(window: np.ndarray, frame: int) -> np.ndarray:
    """Short-time RMS over non-overlapping frames."""
    usable = (len(window) // frame) * frame
    if usable == 0:
        return np.empty(0, dtype=np.float32)
    frames = window[:usable].astype(np.float32).reshape(-1, frame)
    rms: np.ndarray = np.sqrt(np.mean(frames * frames, axis=1))
    return rms


def find_cut(
    samples: np.ndarray,
    start: int,
    *,
    chunk_seconds: float = DEFAULT_CHUNK_SECONDS,
    max_seconds: float = MAX_SEGMENT_SECONDS,
    search_seconds: float = SEARCH_SECONDS,
    sample_rate: int = SAMPLE_RATE,
) -> int:
    """Index at which to end the chunk beginning at ``start``.

    Returns ``len(samples)`` when the remainder already fits. Otherwise picks
    the quietest 20 ms frame inside the search window and cuts through its
    middle, guaranteeing the chunk never exceeds ``max_seconds``.
    """
    remaining = len(samples) - start
    hard_limit = int(max_seconds * sample_rate)
    if remaining <= hard_limit:
        return len(samples)

    lo = start + int(max(1.0, chunk_seconds - search_seconds) * sample_rate)
    hi = start + min(int((chunk_seconds + search_seconds) * sample_rate), hard_limit)
    lo = min(lo, len(samples) - 1)
    hi = min(hi, len(samples))

    if hi <= lo:
        return min(start + hard_limit, len(samples))

    frame = max(1, int(FRAME_SECONDS * sample_rate))
    rms = _frame_rms(samples[lo:hi], frame)
    if rms.size == 0:
        return hi

    quietest = int(np.argmin(rms))
    median = float(np.median(rms))

    # Only trust the quiet frame if it is genuinely a pause. On unbroken speech
    # (or a pure tone) every frame has similar energy, and the argmin is noise -
    # following it would shorten every chunk for no benefit. Fall back to the
    # target boundary instead.
    if median > 0 and float(rms[quietest]) > PAUSE_RATIO * median:
        cut = start + int(chunk_seconds * sample_rate)
    else:
        cut = lo + quietest * frame + frame // 2

    # Never stall, never overshoot.
    return max(start + frame, min(cut, start + hard_limit, len(samples)))


def split_audio(
    samples: np.ndarray,
    *,
    chunk_seconds: float = DEFAULT_CHUNK_SECONDS,
    max_seconds: float = MAX_SEGMENT_SECONDS,
    search_seconds: float = SEARCH_SECONDS,
    sample_rate: int = SAMPLE_RATE,
) -> list[np.ndarray]:
    """Split PCM into segments each at most ``max_seconds`` long."""
    if len(samples) == 0:
        return []

    chunks: list[np.ndarray] = []
    position = 0
    while position < len(samples):
        cut = find_cut(
            samples,
            position,
            chunk_seconds=chunk_seconds,
            max_seconds=max_seconds,
            search_seconds=search_seconds,
            sample_rate=sample_rate,
        )
        if cut <= position:  # pragma: no cover - defensive, find_cut guarantees progress
            cut = min(position + int(max_seconds * sample_rate), len(samples))
        chunks.append(samples[position:cut])
        position = cut
    return chunks


def to_float32(samples: np.ndarray) -> np.ndarray:
    """Convert int16 PCM to the [-1, 1] float32 Whisper's processor expects."""
    return samples.astype(np.float32) / 32768.0


def prepare(
    data: bytes,
    *,
    filename: str | None = None,
    chunk_seconds: float = DEFAULT_CHUNK_SECONDS,
) -> tuple[list[np.ndarray], float]:
    """Decode an upload and split it ready for the ASR model.

    Returns the chunks and the total duration in seconds.
    """
    samples = decode_to_mono16k(data, filename=filename)
    return (
        split_audio(samples, chunk_seconds=chunk_seconds),
        duration_seconds(samples),
    )
