# Examples

Small programs live in [`examples/`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/examples).
None of them print a transcript or a reply unless the gateway returned it.
If `NATLAS_BASE_URL` or `NATLAS_API_KEY` is missing, they say
`No N-ATLAS backend connected` (or the shorter form the one-file scripts use)
and exit. Unit tests inject a fake client. That fake never runs in the app.

Set the same variables as the [quickstart](/quickstart). A trailing `/v1` on
the base URL is optional.

## Voice-note translator

[`examples/voice-note-translator`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/examples/voice-note-translator)

A WhatsApp-style flow: an audio file in Hausa, Igbo, Yorùbá, or Nigerian
English is transcribed with the matching NCAIR1 ASR model, then N-ATLaS either
translates the transcript or replies to it.

```bash
pnpm install
pnpm --filter n-atlas build

export NATLAS_BASE_URL=https://kambah123--natlas-serve-natlasservice-serve.modal.run
export NATLAS_API_KEY=your-gateway-key

node examples/voice-note-translator/cli.mjs voice-note.ogg --language ha --to en
node examples/voice-note-translator/cli.mjs voice-note.ogg --language ha --reply

node examples/voice-note-translator/server.mjs
# open http://127.0.0.1:8787
```

The web page is a local form (file, source language, translate or reply). The
browser talks only to `127.0.0.1`. The API key stays in the server process.
The page shows the attribution string from the model terms. If the gateway is
not configured, the page says so and the server does not open a connection.

Details and the test command are in that directory's README.

## Support-reply helper

[`examples/support-reply`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/examples/support-reply)

A customer-support draft. You pass the customer's message. The script asks
N-ATLaS which of the four languages it is in, unless you pass `--language`,
then asks N-ATLaS for a short reply in that language. The system prompt tells
the model not to invent order numbers, refunds, or delivery dates. The words
that come back are still the model's.

```bash
pip install -e packages/python-sdk
python examples/support-reply/reply.py --message "My transfer has not arrived" --language en
```

## One-file scripts

After `pnpm --filter n-atlas build` and `pip install -e packages/python-sdk`:

```bash
node examples/js/chat.mjs
node examples/js/stream.mjs
node examples/js/transcribe.mjs path/to/note.ogg ha

python examples/python/chat.py
python examples/python/stream.py
python examples/python/transcribe.py path/to/note.ogg ha
```

`transcribe` defaults the language to Hausa when you omit it.

## Playground

[`apps/playground`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/apps/playground)
is the browser UI (chat, speech, translate, summarize). It is built separately
from this docs site. Use the examples above when you want something you can
run from a terminal in a few minutes.
