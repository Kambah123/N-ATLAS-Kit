/**
 * Local page for a WhatsApp-style voice note: transcribe, then translate or reply.
 * Binds to 127.0.0.1 only. The API key stays in this process.
 *
 *   npm install n-atlas
 *   NATLAS_BASE_URL=... NATLAS_API_KEY=... node server.mjs
 */
import http from 'node:http';

import {
  ATTRIBUTION,
  configured,
  decodeAudio,
  defaultCreateClient,
  ExampleError,
  isDirectRun,
  MAX_AUDIO_BYTES,
  MISSING_BACKEND,
  replyToVoiceNote,
  safeFilename,
  translateVoiceNote,
} from './lib.mjs';

const JSON_LIMIT = 12_000_000;

/**
 * @param {{ env?: NodeJS.ProcessEnv, createClient?: typeof defaultCreateClient }} [options]
 */
export function createServer(options = {}) {
  const env = options.env ?? process.env;
  const createClient = options.createClient ?? defaultCreateClient;
  return http.createServer((request, response) => {
    handle(request, response, env, createClient).catch((error) => {
      sendJson(response, statusOf(error), { error: messageOf(error) });
    });
  });
}

/**
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {NodeJS.ProcessEnv} env
 * @param {typeof defaultCreateClient} createClient
 */
async function handle(request, response, env, createClient) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    sendHtml(response, page(configured(env)));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/voice') {
    await postVoice(request, response, env, createClient);
    return;
  }
  sendJson(response, 404, { error: 'Not found.' });
}

/**
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {NodeJS.ProcessEnv} env
 * @param {typeof defaultCreateClient} createClient
 */
async function postVoice(request, response, env, createClient) {
  if (!configured(env)) {
    sendJson(response, 503, { error: MISSING_BACKEND.trim() });
    return;
  }
  const raw = await readBody(request, JSON_LIMIT);
  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ExampleError('Request body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ExampleError('Request body must be a JSON object.');
  }
  const language = typeof body.language === 'string' ? body.language.trim() : '';
  const mode = body.mode;
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!language) throw new ExampleError('language is required.');
  if (mode !== 'translate' && mode !== 'reply') {
    throw new ExampleError('mode must be "translate" or "reply".');
  }
  if (mode === 'translate' && !to) throw new ExampleError('to is required when mode is translate.');
  const filename = safeFilename(typeof body.filename === 'string' ? body.filename : '');
  const audio = decodeAudio(body.audioBase64);

  const client = await createClient(env);
  try {
    if (mode === 'reply') {
      const result = await replyToVoiceNote(client, { audio, filename, language });
      sendJson(response, 200, {
        transcript: result.transcript,
        output: result.reply,
        outputLabel: 'Reply',
        model: result.model,
        attribution: ATTRIBUTION,
      });
      return;
    }
    const result = await translateVoiceNote(client, { audio, filename, language, to });
    sendJson(response, 200, {
      transcript: result.transcript,
      output: result.text,
      outputLabel: `Translation (${result.from} → ${result.to})`,
      model: result.model,
      attribution: ATTRIBUTION,
    });
  } finally {
    if (client && typeof client.close === 'function') await client.close();
  }
}

/**
 * @param {http.IncomingMessage} request
 * @param {number} limit
 */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(new ExampleError('JSON body is too large.', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    request.on('error', (error) => fail(error));
  });
}

function page(ready) {
  const banner = ready ? '' : `<p class="banner">${escapeHtml(MISSING_BACKEND.trim())}</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Voice note translator · N-ATLAS Kit</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: Georgia, "Iowan Old Style", serif; margin: 0; background: #f6f3ec; color: #1c1915; }
    main { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    h1 { font-size: 1.8rem; line-height: 1.2; margin-bottom: 0.4rem; }
    p.lead { margin-top: 0; }
    form, .result, footer { background: #fffdf8; border: 1px solid #e4dccb; border-radius: 12px; padding: 1rem 1.1rem; }
    label { display: block; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.85rem; margin: 0.8rem 0 0.3rem; }
    select, input[type="file"], button { font: inherit; }
    button { margin-top: 1rem; background: #0b6e4f; color: white; border: 0; border-radius: 999px; padding: 0.55rem 1rem; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .banner { background: #fff4e5; border: 1px solid #e2b56a; border-radius: 12px; padding: 0.8rem 1rem; }
    .result { margin-top: 1rem; white-space: pre-wrap; }
    .error { color: #8a1f1f; }
    footer { margin-top: 1.5rem; font-size: 0.9rem; }
    @media (prefers-color-scheme: dark) {
      body { background: #161410; color: #f3efe6; }
      form, .result, footer { background: #221f1a; border-color: #3a342c; }
      .banner { background: #3a2e18; border-color: #8a6a32; color: #f6e7c8; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Voice note translator</h1>
    <p class="lead">Upload a Hausa, Igbo, Yorùbá, or Nigerian English voice note. The matching NCAIR1 speech model transcribes it. N-ATLaS then translates the transcript or replies.</p>
    ${banner}
    <form id="form">
      <label for="file">Audio file (ogg, mp3, m4a, wav, … up to 8 MiB)</label>
      <input id="file" name="file" type="file" accept="audio/*,.ogg,.opus,.mp3,.m4a,.wav,.flac,.webm" required ${ready ? '' : 'disabled'} />
      <label for="language">Spoken language</label>
      <select id="language" name="language" ${ready ? '' : 'disabled'}>
        <option value="ha">Hausa (ha)</option>
        <option value="ig">Igbo (ig)</option>
        <option value="yo">Yorùbá (yo)</option>
        <option value="en">Nigerian English (en)</option>
      </select>
      <label for="mode">What to do with the transcript</label>
      <select id="mode" name="mode" ${ready ? '' : 'disabled'}>
        <option value="translate">Translate</option>
        <option value="reply">Reply in the same language</option>
      </select>
      <div id="target-wrap">
        <label for="to">Translate into</label>
        <select id="to" name="to" ${ready ? '' : 'disabled'}>
          <option value="en">Nigerian English (en)</option>
          <option value="ha">Hausa (ha)</option>
          <option value="ig">Igbo (ig)</option>
          <option value="yo">Yorùbá (yo)</option>
        </select>
      </div>
      <button type="submit" ${ready ? '' : 'disabled'}>Send to N-ATLaS</button>
    </form>
    <section class="result" id="result" hidden>
      <h2>Transcript</h2>
      <p id="transcript"></p>
      <h2 id="output-label">Result</h2>
      <p id="output"></p>
      <p id="model"></p>
      <p class="error" id="error" hidden></p>
    </section>
    <footer>
      <p>${escapeHtml(ATTRIBUTION)}</p>
      <p>Awarri Technologies and the Federal Government of Nigeria, developers of N-ATLaS (Hausa-ASR / Igbo-ASR / Yoruba-ASR / NigerianAccentedEnglish).</p>
    </footer>
  </main>
  <script>
    const form = document.querySelector('#form');
    const mode = document.querySelector('#mode');
    const targetWrap = document.querySelector('#target-wrap');
    const result = document.querySelector('#result');
    const transcript = document.querySelector('#transcript');
    const output = document.querySelector('#output');
    const outputLabel = document.querySelector('#output-label');
    const model = document.querySelector('#model');
    const error = document.querySelector('#error');
    mode.addEventListener('change', () => {
      targetWrap.hidden = mode.value === 'reply';
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = document.querySelector('#file').files[0];
      error.hidden = true;
      result.hidden = false;
      transcript.textContent = 'Waiting for the gateway…';
      output.textContent = '';
      model.textContent = '';
      outputLabel.textContent = 'Result';
      if (!file) return;
      if (file.size > ${MAX_AUDIO_BYTES}) {
        showError('Audio exceeds 8 MiB.');
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          audioBase64: bytesToBase64(bytes),
          filename: file.name,
          language: document.querySelector('#language').value,
          mode: mode.value,
          to: document.querySelector('#to').value,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(body.error || 'Request failed.');
        return;
      }
      transcript.textContent = body.transcript || '';
      outputLabel.textContent = body.outputLabel || 'Result';
      output.textContent = body.output || '';
      model.textContent = body.model ? 'model: ' + body.model : '';
    });
    function showError(text) {
      result.hidden = false;
      transcript.textContent = '';
      output.textContent = '';
      model.textContent = '';
      error.hidden = false;
      error.textContent = text;
    }
    function bytesToBase64(bytes) {
      let binary = '';
      const size = 0x8000;
      for (let i = 0; i < bytes.length; i += size) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + size));
      }
      return btoa(binary);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {http.ServerResponse} response
 * @param {string} html
 */
function sendHtml(response, html) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}

/**
 * @param {http.ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function statusOf(error) {
  if (typeof error?.status === 'number' && error.status >= 400 && error.status < 600) {
    return error.status;
  }
  if (error?.code === 'bad_request') return 400;
  if (error?.code === 'auth') return 401;
  if (error?.code === 'rate_limit') return 429;
  return 502;
}

function messageOf(error) {
  return error instanceof Error ? error.message : 'Request failed.';
}

if (isDirectRun(import.meta.url)) {
  const port = Number(process.env.NATLAS_EXAMPLE_PORT || 8787);
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Voice-note translator at http://127.0.0.1:${port}\n`);
    if (!configured(process.env)) process.stderr.write(MISSING_BACKEND);
  });
}
