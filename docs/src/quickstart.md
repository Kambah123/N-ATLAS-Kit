<script setup>
const chatSrc = '/videos/chat-code.mp4';
const chatPoster = '/videos/chat-code.jpg';
</script>

# Quickstart

You need a running N-ATLaS gateway. Either use one someone has already deployed
or follow [self-hosting](/self-hosting).

The challenge demo gateway (scales to zero — expect a cold start):

```text
https://kambah123--natlas-serve-natlasservice-serve.modal.run
```

Check it without a key:

```bash
curl -fsS https://kambah123--natlas-serve-natlasservice-serve.modal.run/health
```

A healthy body has `"status": "ok"`. `"degraded"` with HTTP 503 means the
process is up and an upstream (vLLM or ASR) is not. Chat and transcription
still need a Bearer key. This repo does not publish that key.

```bash
export NATLAS_BASE_URL=https://kambah123--natlas-serve-natlasservice-serve.modal.run
export NATLAS_API_KEY=your-gateway-key
```

`NATLAS_BASE_URL` may be the origin or the origin plus `/v1`. Both SDKs accept
either. `GET /health` is always on the host root, not under `/v1`.

A Hausa draft of this page is at [Farawa](/ha/quickstart). It has not been
reviewed by a native speaker.

<figure class="demo-figure">
  <video class="demo-video" controls muted playsinline preload="metadata" :poster="chatPoster" :src="chatSrc"></video>
  <figcaption>Hausa chat in the playground, then Get code copies a working SDK call.</figcaption>
</figure>

## Install

```bash
npm install n-atlas
# or: pnpm add n-atlas
pip install natlas
```

## JavaScript

Node.js 20 or newer. The package name is `n-atlas`.

```bash
npm install n-atlas
# or: pnpm add n-atlas
```

```js
import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({
  baseURL: process.env.NATLAS_BASE_URL,
  apiKey: process.env.NATLAS_API_KEY,
});

const reply = await natlas.chat({
  messages: [{ role: 'user', content: 'Menene ake nufi da gwagwarmaya?' }],
  language: 'ha',
});
console.log(reply.content);

const heard = await natlas.transcribe({
  audio: 'voice-note.ogg', // Node path. Browsers pass a Blob or File.
  language: 'ha',
});
console.log(heard.text);
```

`language: 'ha'` on chat is for the gateway log. The gateway strips it before
vLLM. On `transcribe`, `language` is required: it selects `NCAIR1/Hausa-ASR`.
Use `ig`, `yo`, or `en` for the other checkpoints. Aliases such as `hausa` and
`Yorùbá` are accepted.

The same calls are in `examples/js/chat.mjs` and `examples/js/transcribe.mjs`.
They exit before sending anything when the environment variables are unset.

## Python

Python 3.10 or newer. The package name is `natlas`.

```bash
pip install natlas
```

```python
import os
from natlas import NAtlas

with NAtlas(
    base_url=os.environ["NATLAS_BASE_URL"],
    api_key=os.environ["NATLAS_API_KEY"],
) as natlas:
    reply = natlas.chat(
        messages=[{"role": "user", "content": "Menene ake nufi da gwagwarmaya?"}],
        language="ha",
    )
    print(reply.content)

    heard = natlas.transcribe(audio="voice-note.ogg", language="ha")
    print(heard.text)
```

`timeout` on the Python client is **seconds**. The shared environment variable
`NATLAS_TIMEOUT_MS` is milliseconds (default 60000, so 60 seconds).

Async code uses `AsyncNAtlas` with the same method names, awaited. `stream=True`
is an async iterator, so you await the call and then `async for` the chunks.

Scripts: `examples/python/chat.py` and `examples/python/transcribe.py`.

## curl

```bash
curl -sS "$NATLAS_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NATLAS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "NCAIR1/N-ATLaS",
    "messages": [{"role": "user", "content": "Sannu!"}],
    "language": "ha"
  }'
```

If `NATLAS_BASE_URL` already ends in `/v1`, drop the extra `/v1` in the path.

```bash
curl -sS "$NATLAS_BASE_URL/v1/audio/transcriptions" \
  -H "Authorization: Bearer $NATLAS_API_KEY" \
  -F file=@voice-note.ogg \
  -F language=ha
```

`language` is required for transcription. The file can be a WhatsApp `.ogg`
voice note, mp3, m4a, wav, flac, or anything else ffmpeg can decode. The
gateway resamples to 16 kHz mono and splits audio longer than the 30-second
Whisper window.

## What comes back

Chat (non-streaming) is an OpenAI-shaped JSON object. The SDK maps it to
`content`, `role`, `finishReason`, `model`, and `usage`.

Transcription JSON is:

```json
{ "text": "..." }
```

`response_format=verbose_json` adds `task`, `language`, `duration` (seconds),
`model` (the NCAIR1 ASR repo id), and `chunks`. `response_format=text` is the
transcript as plain text.

Streaming chat is Server-Sent Events (`data: {json}` lines, then `data: [DONE]`).
In JavaScript, `stream: true` resolves to an async iterable of `{ delta }` once
the gateway accepts the request. In Python, `stream=True` returns an iterator
of chunks with `delta`.

## If it fails immediately

| What you see                           | What it means                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Set baseURL or NATLAS_BASE_URL`       | The client has no gateway address. Nothing was sent.                                                                                          |
| HTTP 401, `AuthError`                  | Missing or wrong Bearer key.                                                                                                                  |
| The process sits there, then times out | Often a cold start. The default client timeout is 60 seconds, which is shorter than a cold GPU load. See [troubleshooting](/troubleshooting). |
| HTTP 400 on transcription              | Unsupported `language`, empty audio, or ffmpeg could not decode the file.                                                                     |

Full request and response shapes: [Gateway API](/gateway).
