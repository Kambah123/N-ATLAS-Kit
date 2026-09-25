import { createServer } from 'node:http';
import { NAtlas } from 'n-atlas';

const PORT = Number(process.env.PORT || 8788);
const RAW_LANGUAGE = (process.env.WHATSAPP_LANGUAGE || 'ha').trim().toLowerCase();
const NAMES = {
  ha: 'Hausa',
  ig: 'Igbo',
  yo: 'Yoruba',
  en: 'English',
  pcm: 'Nigerian Pidgin',
  pidgin: 'Nigerian Pidgin',
};
// The published SDK accepts ha, ig, yo, and en. Pidgin is prompted in English.
const CHAT_LANGUAGE = RAW_LANGUAGE === 'pcm' || RAW_LANGUAGE === 'pidgin' ? 'en' : RAW_LANGUAGE;
const REPLY_NAME = NAMES[RAW_LANGUAGE] || RAW_LANGUAGE;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

const REQUIRED = [
  'NATLAS_API_KEY',
  'NATLAS_BASE_URL',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
];

function missingEnv() {
  return REQUIRED.filter((name) => !process.env[name]);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('Body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function incomingText(payload) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const messages = change?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        if (message?.type === 'text' && typeof message.text?.body === 'string' && message.from) {
          return { from: String(message.from), text: message.text.body };
        }
      }
    }
  }
  return null;
}

async function replyOnWhatsApp(to, body) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: body.slice(0, 4000) },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(challenge);
      return;
    }
    response.writeHead(403, { 'Content-Type': 'text/plain' });
    response.end('Forbidden');
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    const missing = missingEnv();
    response.writeHead(missing.length ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: missing.length === 0, missing }));
    return;
  }

  if (request.method !== 'POST' || url.pathname !== '/webhook') {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }

  const missing = missingEnv();
  if (missing.length > 0) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: `Missing env: ${missing.join(', ')}` }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(request));
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain' });
    response.end('Bad JSON');
    return;
  }

  const incoming = incomingText(payload);
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end('{"ok":true}');
  if (!incoming) return;

  try {
    const natlas = new NAtlas();
    const reply = await natlas.chat({
      messages: [
        {
          role: 'system',
          content: `You are a helpful Nigerian assistant on WhatsApp. Reply only in ${REPLY_NAME}. Keep it short enough for a chat message.`,
        },
        { role: 'user', content: incoming.text },
      ],
      language: CHAT_LANGUAGE,
    });
    const text = reply.content.trim() || 'Ban da amsa yanzu.';
    await replyOnWhatsApp(incoming.from, text);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
});

server.listen(PORT, () => {
  const missing = missingEnv();
  console.log(`WhatsApp bot listening on :${PORT}`);
  if (missing.length > 0) {
    console.log(`Missing env (webhook will answer 503 until set): ${missing.join(', ')}`);
  }
});
