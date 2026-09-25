# Voice-note translator

WhatsApp-style flow on top of the N-ATLAS Kit gateway:

1. You give it an audio file in **Hausa, Igbo, Yorùbá, or Nigerian English**.
2. The matching NCAIR1 ASR model transcribes it (`NCAIR1/Hausa-ASR`, `NCAIR1/Igbo-ASR`, `NCAIR1/Yoruba-ASR`, or `NCAIR1/NigerianAccentedEnglish`).
3. N-ATLaS (`NCAIR1/N-ATLaS`) either **translates** the transcript or **replies** to it.

Nothing is printed unless the gateway returned it. If `NATLAS_BASE_URL` or `NATLAS_API_KEY` is missing, the CLI exits and the web page says `No N-ATLAS backend connected`. No sample transcript is substituted.

## Setup

From the repository root. Node.js 20 or newer.

```bash
npm install n-atlas
# or: pnpm add n-atlas

export NATLAS_BASE_URL=https://kambah123--natlas-serve-natlasservice-serve.modal.run
export NATLAS_API_KEY=your-gateway-key
```

`NATLAS_BASE_URL` may include `/v1` or not. The demo host scales to zero, so the first request after idle time is a cold start and can take longer than the SDK's default 60 second timeout. Raise `NATLAS_TIMEOUT_MS` if the call times out while `/health` is still coming up. This repo does not contain the Bearer key; it lives in the Modal secret `natlas-api`.

Copy [`.env.example`](./.env.example) for the variable names. Do not commit a filled-in `.env`.

## CLI

```bash
node examples/voice-note-translator/cli.mjs voice-note.ogg --language ha --to en
node examples/voice-note-translator/cli.mjs voice-note.ogg --language yo --reply
```

`--language` is what was spoken. It selects the ASR model. Aliases such as `hausa` work because the SDK normalises them. `--to` must be a different language. `--reply` asks N-ATLaS to answer in the same language. An empty transcript stops the command before a translation or reply is requested.

## Local page

```bash
node examples/voice-note-translator/server.mjs
```

Open <http://127.0.0.1:8787>. The server binds to loopback only. The browser posts the file to this process; the API key is not in the page. Uploads are capped at 8 MiB here (the gateway's own limit is 64 MiB). Set `NATLAS_EXAMPLE_PORT` to change the port.

The footer shows the attribution the model terms require.

## Tests

These do not call a gateway. They check argument parsing, the missing-env path, and a fake client.

```bash
pnpm --filter @n-atlas/example-voice-note test
```

`pnpm test` from the repo root runs the same file, because this directory is in the pnpm workspace.
