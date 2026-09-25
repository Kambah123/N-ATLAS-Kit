# Examples

Small programs that call a real N-ATLaS gateway through the SDKs. None of them
print a fabricated reply. If `NATLAS_BASE_URL` or `NATLAS_API_KEY` is missing,
they say so and exit.

| Example                                             | What it does                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`voice-note-translator`](./voice-note-translator/) | Audio in Hausa, Igbo, Yorùbá, or Nigerian English → transcript → translation or reply. CLI and a page on `127.0.0.1` |
| [`support-reply`](./support-reply/)                 | Draft a customer-support reply in the customer's language                                                            |
| [`js/`](./js/) and [`python/`](./python/)           | One-file chat, stream, and transcribe scripts                                                                        |

The [docs site](../docs/) has the same walkthrough. The
[playground](../apps/playground/) is the browser app and is built separately.

## One-file scripts

Build or install the SDK first. The JavaScript scripts import the built
package, not the TypeScript source.

```bash
pnpm --filter n-atlas build
pip install -e packages/python-sdk

export NATLAS_BASE_URL=http://localhost:8080
export NATLAS_API_KEY=dev-key   # whatever /serve was started with

node examples/js/chat.mjs
node examples/js/stream.mjs
node examples/js/transcribe.mjs path/to/note.ogg ha

python examples/python/chat.py
python examples/python/stream.py
python examples/python/transcribe.py path/to/note.ogg ha
```

`transcribe` takes a language as the second argument (`ha`, `ig`, `yo`, `en`,
or an alias such as `hausa`). It defaults to Hausa.

The voice-note app and the support-reply helper have their own READMEs, tests,
and `.env.example` files. Their tests use a fake client and do not call a
gateway. The one-file scripts were checked for syntax and for the missing-env
path. None of the examples in this tree have been run against a GPU or the
live Modal gateway from this checkout.
