"""Tests for the support-reply example. They never open a socket."""

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))

import reply  # noqa: E402


class FakeClient:
    def __init__(self, language: str | None = "ha", content: str = "Mun karbi sakonka.") -> None:
        self.language = language
        self.content = content
        self.calls: list[tuple[str, object]] = []
        self.closed = False

    def detect_language(self, text: str) -> SimpleNamespace:
        self.calls.append(("detect", text))
        return SimpleNamespace(language=self.language, text="ha", model="NCAIR1/N-ATLaS")

    def chat(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(("chat", kwargs))
        return SimpleNamespace(content=self.content, model="NCAIR1/N-ATLaS")

    def close(self) -> None:
        self.closed = True


class DraftTests(unittest.TestCase):
    def test_explicit_language_skips_detection(self) -> None:
        client = FakeClient()
        draft = reply.draft_reply(client, "My transfer has not arrived", "en")
        self.assertEqual(draft.language, "en")
        self.assertFalse(draft.detected)
        self.assertEqual(client.calls[0][0], "chat")
        messages = client.calls[0][1]["messages"]  # type: ignore[index]
        self.assertIn("Nigerian English", messages[0]["content"])
        self.assertIn("Do not invent", messages[0]["content"])
        self.assertEqual(messages[1]["content"], "My transfer has not arrived")

    def test_detection_then_chat(self) -> None:
        client = FakeClient(language="ha")
        draft = reply.draft_reply(client, "Ina odar na?", None)
        self.assertTrue(draft.detected)
        self.assertEqual(draft.language, "ha")
        self.assertEqual([name for name, _ in client.calls], ["detect", "chat"])
        self.assertEqual(draft.model, "NCAIR1/N-ATLaS")

    def test_unrecognised_detection_does_not_chat(self) -> None:
        client = FakeClient(language=None)
        with self.assertRaises(ValueError):
            reply.draft_reply(client, "hello", None)
        self.assertEqual([name for name, _ in client.calls], ["detect"])

    def test_empty_message_and_empty_reply(self) -> None:
        client = FakeClient()
        with self.assertRaises(ValueError):
            reply.draft_reply(client, "   ", "ha")
        self.assertEqual(client.calls, [])
        client.content = "  "
        with self.assertRaises(ValueError):
            reply.draft_reply(client, "hello", "ha")


class MainTests(unittest.TestCase):
    def test_missing_env_does_not_create_a_client(self) -> None:
        created: list[object] = []

        def factory(env: dict[str, str]) -> object:
            created.append(env)
            raise AssertionError("client was created")

        stderr = io.StringIO()
        stdout = io.StringIO()
        original = sys.stderr, sys.stdout
        sys.stderr, sys.stdout = stderr, stdout
        try:
            code = reply.main(
                ["--message", "hello", "--language", "en"],
                env={},
                client_factory=factory,
            )
        finally:
            sys.stderr, sys.stdout = original
        self.assertEqual(code, 1)
        self.assertIn("No N-ATLAS backend connected", stderr.getvalue())
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(created, [])

    def test_prints_only_the_client_text(self) -> None:
        holder: dict[str, FakeClient] = {}

        def factory(_env: dict[str, str]) -> FakeClient:
            holder["client"] = FakeClient(content="We have received your message.")
            return holder["client"]

        stderr = io.StringIO()
        stdout = io.StringIO()
        original = sys.stderr, sys.stdout
        sys.stderr, sys.stdout = stderr, stdout
        try:
            code = reply.main(
                ["--message", "Where is my order?", "--language", "en"],
                env={"NATLAS_BASE_URL": "http://natlas.test", "NATLAS_API_KEY": "k"},
                client_factory=factory,
            )
        finally:
            sys.stderr, sys.stdout = original
        self.assertEqual(code, 0)
        self.assertIn("We have received your message.", stdout.getvalue())
        self.assertIn("NCAIR1/N-ATLaS", stdout.getvalue())
        self.assertIn("powered by Awarri Technologies", stdout.getvalue())
        self.assertTrue(holder["client"].closed)
        self.assertEqual(stderr.getvalue(), "")

    def test_sdk_exports_the_real_model_id(self) -> None:
        import natlas

        self.assertEqual(natlas.LLM_MODEL_ID, "NCAIR1/N-ATLaS")
        self.assertEqual(natlas.ASR_MODEL_IDS["yo"], "NCAIR1/Yoruba-ASR")


if __name__ == "__main__":
    unittest.main()
