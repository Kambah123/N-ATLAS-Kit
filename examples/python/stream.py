"""Stream a Hausa reply from a running N-ATLaS gateway.

    pip install natlas
    NATLAS_BASE_URL=http://localhost:8080 NATLAS_API_KEY=... python examples/python/stream.py
"""

from __future__ import annotations

import os
import sys

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

    with NAtlas(base_url=base_url, api_key=api_key) as natlas:
        for chunk in natlas.chat(
            messages=[{"role": "user", "content": "Menene ake nufi da gwagwarmaya?"}],
            language="ha",
            stream=True,
        ):
            if chunk.delta:
                sys.stdout.write(chunk.delta)
                sys.stdout.flush()
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
