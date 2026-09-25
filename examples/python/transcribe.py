"""Transcribe a file with the NCAIR1 ASR model for one language.

    pip install -e packages/python-sdk
    NATLAS_BASE_URL=... NATLAS_API_KEY=... python examples/python/transcribe.py note.ogg ha

Language defaults to ha. Aliases such as hausa, igbo, yoruba, and english work.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from natlas import NAtlas


def main() -> None:
    base_url = os.environ.get("NATLAS_BASE_URL")
    api_key = os.environ.get("NATLAS_API_KEY")
    if not base_url or not api_key:
        sys.stderr.write(
            "Set NATLAS_BASE_URL and NATLAS_API_KEY to a running N-ATLaS gateway. "
            "Nothing was sent.\n"
        )
        raise SystemExit(1)
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python examples/python/transcribe.py <audio-file> [language]\n")
        raise SystemExit(1)

    audio = Path(sys.argv[1])
    language = sys.argv[2] if len(sys.argv) > 2 else "ha"
    with NAtlas(base_url=base_url, api_key=api_key) as natlas:
        heard = natlas.transcribe(audio=audio, language=language)
    sys.stdout.write(f"{heard.text}\n")


if __name__ == "__main__":
    main()
