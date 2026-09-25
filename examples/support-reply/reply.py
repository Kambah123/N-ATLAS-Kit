"""Draft a customer-support reply with N-ATLaS.

The customer's message is sent to the gateway. The reply printed on stdout is
the model's text. If NATLAS_BASE_URL or NATLAS_API_KEY is missing, the script
exits and does not invent a reply.

    pip install natlas
    python examples/support-reply/reply.py --message "My transfer has not arrived" --language en
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

MISSING = (
    "No N-ATLAS backend connected. Set NATLAS_BASE_URL and NATLAS_API_KEY. Nothing was sent.\n"
)

ATTRIBUTION = (
    "N-ATLaS is an initiative of the Federal Ministry of Communications, "
    "Innovation and Digital Economy, and powered by Awarri Technologies."
)

LANGUAGE_NAMES = {
    "ha": "Hausa",
    "ig": "Igbo",
    "yo": "Yoruba",
    "en": "Nigerian English",
}


@dataclass(frozen=True)
class Draft:
    """A reply that came back from the gateway."""

    language: str
    text: str
    model: str
    detected: bool


def build_messages(message: str, language: str) -> list[dict[str, str]]:
    """English instruction that names the language. Not a reviewed translation."""
    name = LANGUAGE_NAMES[language]
    return [
        {
            "role": "system",
            "content": (
                "You are a customer-support assistant for a Nigerian business. "
                f"Reply in {name} only. Be polite and concise. "
                "Do not invent order numbers, refunds, delivery dates, prices, or policies. "
                "If the message does not include enough detail, ask one clear question."
            ),
        },
        {"role": "user", "content": message},
    ]


def draft_reply(client: object, message: str, language: str | None) -> Draft:
    """Detect the language when needed, then ask N-ATLaS for the reply."""
    text = message.strip()
    if not text:
        raise ValueError("The customer message is empty. Nothing was sent.")

    detected = False
    chosen = language
    if chosen is None:
        detection = client.detect_language(text)  # type: ignore[attr-defined]
        code = getattr(detection, "language", None)
        if code not in LANGUAGE_NAMES:
            raise ValueError(
                "N-ATLaS did not return a recognised language code (ha, ig, yo, en). "
                "Pass --language. Nothing was invented."
            )
        chosen = str(code)
        detected = True
    elif chosen not in LANGUAGE_NAMES:
        raise ValueError("language must be one of: ha, ig, yo, en.")

    result = client.chat(  # type: ignore[attr-defined]
        messages=build_messages(text, chosen),
        language=chosen,
        temperature=0.3,
    )
    content = getattr(result, "content", None)
    if not isinstance(content, str) or not content.strip():
        raise ValueError("The gateway returned an empty reply. Nothing was invented in its place.")
    model = getattr(result, "model", "")
    return Draft(language=chosen, text=content.strip(), model=str(model), detected=detected)


def configured(env: dict[str, str]) -> bool:
    return bool(env.get("NATLAS_BASE_URL", "").strip() and env.get("NATLAS_API_KEY", "").strip())


def default_client(env: dict[str, str]) -> object:
    from natlas import NAtlas

    return NAtlas(base_url=env["NATLAS_BASE_URL"], api_key=env["NATLAS_API_KEY"])


def read_message(args: argparse.Namespace) -> str:
    pieces: list[str] = []
    if args.message:
        pieces.append(args.message)
    if args.file:
        pieces.append(Path(args.file).read_text(encoding="utf-8"))
    if not pieces:
        raise ValueError("Pass --message or --file. Nothing was sent.")
    return "\n".join(pieces)


def format_draft(draft: Draft) -> str:
    how = "detected" if draft.detected else "given"
    return (
        f"language: {draft.language} ({how})\n"
        f"model: {draft.model}\n"
        "---\n"
        f"{draft.text}\n"
        "---\n"
        f"{ATTRIBUTION}\n"
    )


def main(
    argv: list[str] | None = None,
    env: dict[str, str] | None = None,
    client_factory: Callable[[dict[str, str]], object] | None = None,
) -> int:
    """Return a process exit code. Writes the reply only after the gateway returns one."""
    parser = argparse.ArgumentParser(
        description="Draft a support reply in the customer's language via N-ATLaS.",
    )
    parser.add_argument("--message", default="", help="Customer message text.")
    parser.add_argument("--file", default="", help="UTF-8 file containing the customer message.")
    parser.add_argument(
        "--language",
        default="",
        choices=["", *LANGUAGE_NAMES.keys()],
        help="Skip detection and use this code: ha, ig, yo, or en.",
    )
    args = parser.parse_args(argv)
    environment = env if env is not None else dict(__import__("os").environ)

    try:
        message = read_message(args)
    except ValueError as exc:
        sys.stderr.write(f"{exc}\n")
        return 2
    except OSError as exc:
        sys.stderr.write(f"Could not read --file: {exc}\n")
        return 2

    if not configured(environment):
        sys.stderr.write(MISSING)
        return 1

    factory = client_factory or default_client
    client = factory(environment)
    try:
        language = args.language or None
        draft = draft_reply(client, message, language)
    except Exception as exc:  # gateway and validation errors are reported, not wrapped
        sys.stderr.write(f"{exc}\n")
        return 1
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    sys.stdout.write(format_draft(draft))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
