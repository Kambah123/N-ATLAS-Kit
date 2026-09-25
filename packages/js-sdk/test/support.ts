import { NAtlas, type NAtlasOptions } from '../src/client.js';

export interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
  signal: AbortSignal | undefined;
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

export interface Harness {
  client: NAtlas;
  calls: Call[];
  sleeps: number[];
}

export function harness(
  handler: (call: Call) => Response | Promise<Response>,
  options: NAtlasOptions = {},
): Harness {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    return handler(call);
  };
  const client = new NAtlas({
    baseURL: 'http://natlas.test/v1',
    apiKey: 'test-key',
    fetch: fetchImpl,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0,
    ...options,
  });
  return { client, calls, sleeps };
}

export function bodyJson(call: Call): unknown {
  if (typeof call.body !== 'string') {
    throw new Error(`expected a JSON string body, got ${typeof call.body}`);
  }
  return JSON.parse(call.body) as unknown;
}

export const chatCompletion = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  model: 'NCAIR1/N-ATLaS',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Sannu da zuwa' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
};

export const userMessage = [{ role: 'user' as const, content: 'Sannu!' }];
