import { afterEach, describe, expect, it } from 'vitest';

import {
  AbortError,
  AuthError,
  BadRequestError,
  NAtlas,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from '../src/index.js';
import { delayMs } from '../src/http.js';
import {
  bodyJson,
  chatCompletion,
  harness,
  jsonResponse,
  sseResponse,
  userMessage,
} from './support.js';

function waitForAbort(
  call: { signal: AbortSignal | undefined },
  giveUpMs: number,
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('client did not abort')), giveUpMs);
    const signal = call.signal;
    if (!signal) {
      clearTimeout(timer);
      reject(new Error('missing abort signal'));
      return;
    }
    if (signal.aborted) {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

const ENV_KEYS = [
  'NATLAS_BASE_URL',
  'NATLAS_API_KEY',
  'NATLAS_BACKEND',
  'NATLAS_MODEL',
  'NATLAS_TIMEOUT_MS',
  'NATLAS_MAX_RETRIES',
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = saved[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
    delete saved[key];
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('chat', () => {
  it('posts a non-streaming completion to the gateway', async () => {
    const { client, calls } = harness(() =>
      jsonResponse(200, chatCompletion, { 'x-request-id': 'req-1' }),
    );
    const result = await client.chat({
      messages: userMessage,
      language: 'Hausa',
      temperature: 0.3,
      maxTokens: 128,
      topP: 0.9,
      stop: ['\n'],
    });

    expect(result.content).toBe('Sannu da zuwa');
    expect(result.role).toBe('assistant');
    expect(result.finishReason).toBe('stop');
    expect(result.model).toBe('NCAIR1/N-ATLaS');
    expect(result.id).toBe('chatcmpl-1');
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 4, totalTokens: 15 });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe('http://natlas.test/v1/chat/completions');
    expect(call?.headers.get('authorization')).toBe('Bearer test-key');
    expect(call?.headers.get('content-type')).toBe('application/json');
    expect(call?.headers.get('user-agent')).toBe('n-atlas/0.0.0');
    expect(await bodyJson(call!)).toEqual({
      model: 'NCAIR1/N-ATLaS',
      messages: userMessage,
      stream: false,
      language: 'ha',
      temperature: 0.3,
      max_tokens: 128,
      top_p: 0.9,
      stop: ['\n'],
    });
  });

  it('does not send a language field when the caller omitted it', async () => {
    const { client, calls } = harness(() => jsonResponse(200, chatCompletion));
    await client.chat({ messages: userMessage });
    const body = (await bodyJson(calls[0]!)) as { language?: string };
    expect(body.language).toBeUndefined();
  });

  it('streams deltas from SSE, including a packet split mid-JSON', async () => {
    const first =
      'data: {"id":"c1","model":"NCAIR1/N-ATLaS","choices":[{"delta":{"content":"San"},"finish_reason":null}]}\n\n';
    const splitAt = first.indexOf('San') + 1;
    const { client } = harness(() =>
      sseResponse([
        ': keep-alive\n',
        first.slice(0, splitAt),
        first.slice(splitAt),
        'event: ping\n',
        'data: {"choices":[{"delta":{"content":"nu"},"finish_reason":null}]}\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
        'data: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
      ]),
    );

    const deltas: string[] = [];
    let finish: string | null = null;
    let usage: { totalTokens: number } | null = null;
    for await (const chunk of await client.chat({
      messages: userMessage,
      stream: true,
      language: 'ha',
    })) {
      if (chunk.delta) deltas.push(chunk.delta);
      if (chunk.finishReason) finish = chunk.finishReason;
      if (chunk.usage) usage = chunk.usage;
    }
    expect(deltas.join('')).toBe('Sannu');
    expect(finish).toBe('stop');
    expect(usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });
  });

  it('rejects a non-NCAIR model before calling the network', async () => {
    const { client, calls } = harness(() => jsonResponse(200, chatCompletion));
    await expect(client.chat({ messages: userMessage, model: 'gpt-4o' })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(calls).toHaveLength(0);
  });

  it('rejects an empty message list', async () => {
    const { client, calls } = harness(() => jsonResponse(200, chatCompletion));
    await expect(client.chat({ messages: [] })).rejects.toBeInstanceOf(BadRequestError);
    expect(calls).toHaveLength(0);
  });
});

describe('errors', () => {
  it.each([
    [401, AuthError, 'auth'],
    [403, AuthError, 'auth'],
    [400, BadRequestError, 'bad_request'],
    [413, BadRequestError, 'bad_request'],
    [422, BadRequestError, 'bad_request'],
    [429, RateLimitError, 'rate_limit'],
    [500, ServerError, 'server'],
    [502, ServerError, 'server'],
    [503, ServerError, 'server'],
  ] as const)('maps HTTP %i to %s', async (status, ctor, code) => {
    const { client, calls } = harness(() =>
      jsonResponse(status, { detail: `failed ${status}` }, { 'x-request-id': 'req-9' }),
    );
    const error = await client.chat({ messages: userMessage }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ctor);
    expect(error).toMatchObject({
      status,
      code,
      requestId: 'req-9',
      message: `failed ${status}`,
    });
    expect(String((error as Error).message)).not.toContain('test-key');
    expect(calls).toHaveLength(1);
  });

  it('reads FastAPI validation errors and OpenAI-style error objects', async () => {
    const validation = harness(() =>
      jsonResponse(422, { detail: [{ msg: 'field required', loc: ['body', 'messages'] }] }),
    );
    await expect(validation.client.chat({ messages: userMessage })).rejects.toThrow(
      /field required/,
    );

    const openai = harness(() =>
      jsonResponse(400, { error: { message: 'model is required', type: 'invalid_request_error' } }),
    );
    await expect(openai.client.chat({ messages: userMessage })).rejects.toThrow(
      'model is required',
    );
  });

  it('maps a thrown fetch failure to NetworkError', async () => {
    const { client } = harness(() => {
      throw new TypeError('connect ECONNREFUSED');
    });
    const error = await client.chat({ messages: userMessage }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toContain('ECONNREFUSED');
    expect((error as NetworkError).status).toBeNull();
  });
});

describe('retries and timeouts', () => {
  it('retries idempotent GETs with exponential backoff, then succeeds', async () => {
    let n = 0;
    const { client, calls, sleeps } = harness(() => {
      n += 1;
      if (n < 3) return jsonResponse(503, { detail: 'warming up' });
      return jsonResponse(200, {
        object: 'list',
        data: [{ id: 'NCAIR1/N-ATLaS', object: 'model', owned_by: 'vllm', created: 10 }],
      });
    });
    const models = await client.listModels();
    expect(models.data).toEqual([
      { id: 'NCAIR1/N-ATLaS', object: 'model', ownedBy: 'vllm', created: 10 },
    ]);
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.url === 'http://natlas.test/v1/models')).toBe(true);
    expect(sleeps).toEqual([200, 400]);
  });

  it('does not retry a chat POST unless the call opts in', async () => {
    let n = 0;
    const once = harness(() => {
      n += 1;
      return jsonResponse(502, { detail: 'LLM upstream unreachable: ConnectError' });
    });
    await expect(once.client.chat({ messages: userMessage })).rejects.toBeInstanceOf(ServerError);
    expect(n).toBe(1);

    let m = 0;
    const opted = harness(() => {
      m += 1;
      if (m < 3) return jsonResponse(502, { detail: 'down' });
      return jsonResponse(200, chatCompletion);
    });
    const result = await opted.client.chat({ messages: userMessage, maxRetries: 2 });
    expect(result.content).toBe('Sannu da zuwa');
    expect(m).toBe(3);
    expect(opted.sleeps).toEqual([200, 400]);
  });

  it('retries chat when the client is configured to retry non-idempotent calls', async () => {
    let n = 0;
    const { client, sleeps } = harness(
      () => {
        n += 1;
        if (n === 1) return jsonResponse(504, { detail: 'gateway timeout' });
        return jsonResponse(200, chatCompletion);
      },
      { retryNonIdempotent: true, maxRetries: 1 },
    );
    await client.chat({ messages: userMessage });
    expect(n).toBe(2);
    expect(sleeps).toEqual([200]);
  });

  it('honours Retry-After on 429 and then raises RateLimitError', async () => {
    const { client, calls, sleeps } = harness(
      () => jsonResponse(429, { detail: 'slow down' }, { 'retry-after': '2' }),
      { maxRetries: 2 },
    );
    const error = await client.listModels().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(2000);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 2000]);
  });

  it('does not retry 401 or 400', async () => {
    const auth = harness(() => jsonResponse(401, { detail: 'Missing or invalid API key.' }));
    await expect(auth.client.listModels()).rejects.toBeInstanceOf(AuthError);
    expect(auth.calls).toHaveLength(1);
    expect(auth.sleeps).toEqual([]);

    const bad = harness(() => jsonResponse(400, { detail: 'Request body must be JSON.' }));
    await expect(bad.client.listModels()).rejects.toBeInstanceOf(BadRequestError);
    expect(bad.calls).toHaveLength(1);
  });

  it('retries network errors on health, not on chat', async () => {
    let healthTries = 0;
    const health = harness(() => {
      healthTries += 1;
      if (healthTries < 2) throw new TypeError('socket hang up');
      return jsonResponse(200, {
        status: 'ok',
        version: '0.1.0',
        attribution: 'Awarri Technologies',
      });
    });
    const report = await health.client.health();
    expect(report.ok).toBe(true);
    expect(healthTries).toBe(2);

    let chatTries = 0;
    const chat = harness(() => {
      chatTries += 1;
      throw new TypeError('socket hang up');
    });
    await expect(chat.client.chat({ messages: userMessage })).rejects.toBeInstanceOf(NetworkError);
    expect(chatTries).toBe(1);
  });

  it('aborts a timed-out chat once and surfaces TimeoutError', async () => {
    const { client, calls } = harness((call) => waitForAbort(call, 2_000), { timeout: 30 });
    const error = await client.chat({ messages: userMessage }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).message).toMatch(/30 ms/);
    expect(calls).toHaveLength(1);
  });

  it('retries a timed-out health check', async () => {
    const { client, calls } = harness((call) => waitForAbort(call, 2_000), {
      timeout: 20,
      maxRetries: 1,
    });
    await expect(client.health()).rejects.toBeInstanceOf(TimeoutError);
    expect(calls).toHaveLength(2);
  });

  it('does not call the network when the signal is already aborted', async () => {
    const { client, calls } = harness(() => jsonResponse(200, chatCompletion));
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.chat({ messages: userMessage, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(calls).toHaveLength(0);
  });

  it('stops retrying when the caller aborts during backoff', async () => {
    const controller = new AbortController();
    const { client, calls } = harness(() => jsonResponse(503, { detail: 'down' }), {
      sleep: (_ms, signal) =>
        new Promise((_resolve, reject) => {
          if (!signal) {
            reject(new Error('expected the caller signal'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(new AbortError('The request was aborted.'));
            },
            { once: true },
          );
          controller.abort();
        }),
    });
    await expect(client.listModels({ signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(calls).toHaveLength(1);
  });

  it('aborts an in-flight request when the caller signal fires', async () => {
    const controller = new AbortController();
    const { client } = harness((call) => {
      const signal = call.signal;
      return new Promise((_resolve, reject) => {
        if (!signal) {
          reject(new Error('missing signal'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
        setTimeout(() => controller.abort(), 10);
      });
    });
    await expect(
      client.chat({ messages: userMessage, signal: controller.signal, timeout: 2_000 }),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it('computes capped exponential backoff with jitter', () => {
    const server = new ServerError('down');
    expect(delayMs(0, server, () => 0)).toBe(200);
    expect(delayMs(0, server, () => 0.5)).toBe(250);
    expect(delayMs(3, server, () => 0)).toBe(1600);
    expect(delayMs(10, server, () => 0)).toBe(8000);
    const limited = new RateLimitError('slow', { retryAfterMs: 1500 });
    expect(delayMs(4, limited, () => 0.9)).toBe(1500);
    expect(delayMs(0, new AbortError('stop'), () => 0)).toBe(200);
  });
});

describe('models and health', () => {
  it('lists models and checks health, including a degraded 503', async () => {
    const models = harness(() =>
      jsonResponse(200, {
        object: 'list',
        data: [
          { id: 'NCAIR1/N-ATLaS', object: 'model', owned_by: 'vllm', created: 1 },
          { object: 'model' },
        ],
      }),
    );
    const list = await models.client.listModels();
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.id).toBe('NCAIR1/N-ATLaS');
    expect(models.calls[0]?.method).toBe('GET');

    const healthy = harness(() =>
      jsonResponse(200, {
        status: 'ok',
        version: '0.1.0',
        llm: { model: 'NCAIR1/N-ATLaS', status: 'ok' },
        asr: { status: 'ok', languages: ['ha', 'ig', 'yo', 'en'] },
        attribution: 'Powered by Awarri Technologies',
      }),
    );
    const report = await healthy.client.health();
    expect(report.ok).toBe(true);
    expect(report.llm).toMatchObject({ model: 'NCAIR1/N-ATLaS' });
    expect(healthy.calls[0]?.url).toBe('http://natlas.test/health');
    expect(report.attribution).toContain('Awarri');

    const degraded = harness(() =>
      jsonResponse(503, { status: 'degraded', llm: { status: 'down' } }),
    );
    const down = await degraded.client.health();
    expect(down.ok).toBe(false);
    expect(down.status).toBe('degraded');
  });

  it('accepts a base URL with or without /v1', async () => {
    const root = harness(() => jsonResponse(200, { status: 'ok' }), {
      baseURL: 'http://natlas.test/',
    });
    await root.client.health();
    expect(root.calls[0]?.url).toBe('http://natlas.test/health');

    const chat = harness(() => jsonResponse(200, chatCompletion), {
      baseURL: 'http://natlas.test',
    });
    await chat.client.chat({ messages: userMessage });
    expect(chat.calls[0]?.url).toBe('http://natlas.test/v1/chat/completions');
  });
});

describe('configuration', () => {
  it('reads NATLAS_BASE_URL and NATLAS_API_KEY from the environment', async () => {
    setEnv('NATLAS_BASE_URL', 'http://env.test/v1');
    setEnv('NATLAS_API_KEY', 'env-key');
    setEnv('NATLAS_TIMEOUT_MS', '1500');
    setEnv('NATLAS_MAX_RETRIES', '0');
    const seen: { authorization: string | null; url: string }[] = [];
    const direct = new NAtlas({
      fetch: (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        seen.push({ url, authorization: new Headers(init?.headers).get('authorization') });
        return Promise.resolve(jsonResponse(200, chatCompletion));
      },
      sleep: () => Promise.resolve(),
      random: () => 0,
    });
    await direct.chat({ messages: userMessage });
    expect(seen[0]).toEqual({
      url: 'http://env.test/v1/chat/completions',
      authorization: 'Bearer env-key',
    });
  });

  it('lets constructor arguments override the environment', async () => {
    setEnv('NATLAS_BASE_URL', 'http://env.test/v1');
    setEnv('NATLAS_API_KEY', 'env-key');
    const seen: string[] = [];
    const client = new NAtlas({
      baseURL: 'http://arg.test',
      apiKey: 'arg-key',
      fetch: (input, init) => {
        seen.push(new Headers(init?.headers).get('authorization') ?? '');
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        seen.push(url);
        return Promise.resolve(jsonResponse(200, { status: 'ok' }));
      },
    });
    await client.health();
    expect(seen).toEqual(['Bearer arg-key', 'http://arg.test/health']);
  });

  it('omits Authorization when no key is configured', async () => {
    setEnv('NATLAS_API_KEY', undefined);
    const headers: Array<string | null> = [];
    const client = new NAtlas({
      baseURL: 'http://natlas.test/v1',
      fetch: (_input, init) => {
        headers.push(new Headers(init?.headers).get('authorization'));
        return Promise.resolve(jsonResponse(200, { status: 'ok' }));
      },
    });
    await client.health();
    expect(headers).toEqual([null]);
  });

  it('rejects a missing base URL, a bad backend, and the unavailable official API', () => {
    setEnv('NATLAS_BASE_URL', undefined);
    expect(() => new NAtlas({ fetch: () => Promise.resolve(jsonResponse(200, {})) })).toThrow(
      /NATLAS_BASE_URL/,
    );
    expect(() => new NAtlas({ baseURL: 'http://natlas.test', backend: 'nope' })).toThrow(
      BadRequestError,
    );
    expect(() => new NAtlas({ baseURL: 'http://natlas.test', backend: 'official' })).toThrow(
      /not public yet/,
    );
    expect(() => new NAtlas({ baseURL: 'ftp://natlas.test' })).toThrow(BadRequestError);
    expect(() => new NAtlas({ baseURL: 'http://natlas.test', apiKey: 'bad\nkey' })).toThrow(
      BadRequestError,
    );
    expect(() => new NAtlas({ baseURL: 'http://natlas.test', maxRetries: 9 })).toThrow(
      BadRequestError,
    );
    expect(() => new NAtlas({ baseURL: 'http://natlas.test', model: 'other/model' })).toThrow(
      BadRequestError,
    );
  });

  it('accepts the hf-endpoint backend as the same wire protocol', async () => {
    setEnv('NATLAS_BACKEND', 'hf-endpoint');
    const urls: string[] = [];
    const client = new NAtlas({
      baseURL: 'https://endpoint.example/v1',
      apiKey: 'k',
      fetch: (input) => {
        urls.push(
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        );
        return Promise.resolve(jsonResponse(200, chatCompletion));
      },
    });
    await client.chat({ messages: userMessage });
    expect(urls).toEqual(['https://endpoint.example/v1/chat/completions']);
  });
});
