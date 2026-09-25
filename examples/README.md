# Examples

Small programs that call a real N-ATLaS gateway through the SDKs. None of them
print a fabricated reply. If `NATLAS_BASE_URL` or `NATLAS_API_KEY` is missing,
they say so and exit.

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

These scripts were checked for syntax and for the missing-env path. They were
not run against a GPU or a live gateway.

## Still planned

Larger sample apps, each with its own README, are not in this tree yet:

| Example                           | Stack   | What it does                                                                    |
| --------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `hausa-chatbot-cli`               | Python  | A terminal chatbot that talks Hausa, using `natlas`                             |
| `whatsapp-voice-note-transcriber` | Node    | Takes an `.ogg` voice note → transcribes it in Hausa → translates it to English |
| `yoruba-summarizer`               | JS      | Summarises a long Yorùbá document                                               |
| `nextjs-chat-starter`             | Next.js | A minimal template to clone and ship                                            |
| `colab-notebook`                  | Jupyter | Loads the SDK and calls a hosted endpoint                                       |
