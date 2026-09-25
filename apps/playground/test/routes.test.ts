import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as chat } from '@/app/api/chat/route';
import { GET as health } from '@/app/api/health/route';
import { POST as transcribe } from '@/app/api/transcribe/route';
import { MAX_AUDIO_SECONDS, RATE_LIMITS } from '@/lib/limits';
import { resetRateLimits } from '@/lib/rate-limit';
import { LLM_MODEL_ID } from '@/lib/types';

const KEY = 'unit-test-key-not-a-secret';

beforeEach(() => {
  resetRateLimits();
  process.env.NATLAS_BASE_URL = 'https://gateway.test';
  process.env.NATLAS_API_KEY = KEY;
  process.env.NATLAS_HEALTH_TIMEOUT_MS = '200';
  process.env.NATLAS_UPSTREAM_TIMEOUT_MS = '2000';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NATLAS_BASE_URL;
  delete process.env.NATLAS_API_KEY;
  delete process.env.NATLAS_HEALTH_TIMEOUT_MS;
  delete process.env.NATLAS_UPSTREAM_TIMEOUT_MS;
});

describe('GET /api/health', () => {
  it('says the backend is not connected without calling upstream', async () => {
    delete process.env.NATLAS_BASE_URL;
    delete process.env.NATLAS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await health(request('GET', '/api/health'));
    const body = (await response.json()) as { status: string; message: string };
    expect(body.status).toBe('unconfigured');
    expect(body.message).toMatch(/No N-ATLAS backend connected/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports ready from a healthy gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Response.json({
          status: 'ok',
          llm: { model: LLM_MODEL_ID, status: 'ok' },
          asr: { status: 'ok' },
        }),
      ),
    );
    const response = await health(request('GET', '/api/health', { ip: '203.0.113.10' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ready', llm: 'ok', asr: 'ok' });
  });

  it('treats a Modal 303 as the model waking up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Response(null, {
            status: 303,
            headers: { location: 'https://gateway.test/health' },
          }),
      ),
    );
    const response = await health(request('GET', '/api/health', { ip: '203.0.113.11' }));
    const body = (await response.json()) as { status: string; message: string };
    expect(body.status).toBe('waking');
    expect(body.message).toMatch(/first request can take ~2 min/);
  });
});

describe('POST /api/chat', () => {
  it('streams upstream bytes and sends the bearer token only to the gateway', async () => {
    const seen: { url: string; authorization: string | null; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        seen.push({
          url: String(url),
          authorization: headers.get('authorization'),
          body: typeof init.body === 'string' ? init.body : '',
        });
        return new Response(
          'data: {"choices":[{"delta":{"content":"Sannu"}}]}\n\ndata: [DONE]\n\n',
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      }),
    );

    const response = await chat(jsonRequest(chatBody(), '203.0.113.20'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const streamed = await response.text();
    expect(streamed).toContain('Sannu');
    expect(streamed).not.toContain(KEY);
    expect(seen[0]?.url).toBe('https://gateway.test/v1/chat/completions');
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.body).toContain(LLM_MODEL_ID);
    expect(seen[0]?.body).toContain('"language":"ha"');
  });

  it('follows a 303 and does not forward the API key off-origin', async () => {
    const seen: { url: string; authorization: string | null; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        seen.push({
          url: String(url),
          authorization: headers.get('authorization'),
          method: String(init.method),
        });
        if (seen.length === 1) {
          return new Response(null, {
            status: 303,
            headers: { location: 'https://results.example/wait/1' },
          });
        }
        return Response.json({ choices: [{ message: { content: 'Sannu' } }] });
      }),
    );

    const response = await chat(jsonRequest({ ...chatBody(), stream: false }, '203.0.113.21'));
    expect(response.status).toBe(200);
    expect(seen[1]?.url).toBe('https://results.example/wait/1');
    expect(seen[1]?.method).toBe('GET');
    expect(seen[1]?.authorization).toBeNull();
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    const payload = (await response.json()) as { choices: { message: { content: string } }[] };
    expect(payload.choices[0]?.message.content).toBe('Sannu');
    expect(JSON.stringify(payload)).not.toContain(KEY);
  });

  it('refuses to run when the server is not configured', async () => {
    delete process.env.NATLAS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await chat(jsonRequest(chatBody(), '203.0.113.22'));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate limits a noisy address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Response.json({ choices: [] })),
    );
    let last = 200;
    for (let attempt = 0; attempt < RATE_LIMITS.chat.limit + 1; attempt += 1) {
      const response = await chat(jsonRequest({ ...chatBody(), stream: false }, '203.0.113.23'));
      last = response.status;
      await response.arrayBuffer().catch(() => undefined);
    }
    expect(last).toBe(429);
  });

  it('strips the API key out of an upstream error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Response.json({ detail: `rejected ${KEY}` }, { status: 400 })),
    );
    const response = await chat(jsonRequest({ ...chatBody(), stream: false }, '203.0.113.24'));
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain(KEY);
  });
});

describe('POST /api/transcribe', () => {
  it('forwards multipart audio and returns only the transcript', async () => {
    const seen: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        seen.push({
          url: String(url),
          authorization: new Headers(init.headers).get('authorization'),
        });
        return Response.json({ text: 'sannu da zuwa', model: LLM_MODEL_ID });
      }),
    );
    const response = await transcribe(audioRequest('203.0.113.30'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: 'sannu da zuwa' });
    expect(seen[0]?.url).toBe('https://gateway.test/v1/audio/transcriptions');
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
  });

  it('requires a language and a real audio file', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const missingLanguage = new FormData();
    missingLanguage.set(
      'file',
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
      'note.ogg',
    );
    const noLanguage = await transcribe(formRequest(missingLanguage, '203.0.113.31'));
    expect(noLanguage.status).toBe(400);

    const badFile = new FormData();
    badFile.set('language', 'ha');
    badFile.set('file', new Blob([new Uint8Array([1])], { type: 'text/plain' }), 'notes.txt');
    const rejected = await transcribe(formRequest(badFile, '203.0.113.32'));
    expect(rejected.status).toBe(400);
  });

  it('rejects a WAV past the duration limit before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.set('language', 'en');
    form.set(
      'file',
      new Blob([makeWav(MAX_AUDIO_SECONDS + 5, 1)], { type: 'audio/wav' }),
      'long.wav',
    );
    const response = await transcribe(formRequest(form, '203.0.113.33'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function chatBody() {
  return {
    messages: [{ role: 'user', content: 'Sannu' }],
    language: 'ha',
    temperature: 0.7,
    max_tokens: 128,
    stream: true,
  };
}

function request(method: string, path: string, options?: { ip?: string }): Request {
  return new Request(`http://playground.local${path}`, {
    method,
    headers: { 'x-forwarded-for': options?.ip ?? '203.0.113.1' },
  });
}

function jsonRequest(body: unknown, ip: string): Request {
  return new Request('http://playground.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function audioRequest(ip: string): Request {
  const form = new FormData();
  form.set('language', 'ha');
  form.set('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/ogg' }), 'note.ogg');
  return formRequest(form, ip);
}

function formRequest(form: FormData, ip: string): Request {
  return new Request('http://playground.local/api/transcribe', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: form,
  });
}

function makeWav(dataBytes: number, byteRate: number): Uint8Array {
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1)
      out[offset + index] = text.charCodeAt(index);
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  return out;
}
