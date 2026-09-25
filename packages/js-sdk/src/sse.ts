import { ServerError } from './errors.js';

const DONE = Symbol('sse-done');

/**
 * Yield parsed `data:` payloads from an SSE body.
 *
 * Bytes may split a line in half; this buffers until a newline. A trailing
 * line without a newline is still parsed when the stream ends. `data: [DONE]`
 * ends the iterator. Event, id, and comment lines are ignored.
 */
export async function* readSseJson(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const drained = yield* drain(buffer, false);
      if (drained.done) return;
      buffer = drained.rest;
    }
    buffer += decoder.decode();
    yield* drain(buffer, true);
  } catch (error) {
    if (error instanceof ServerError) throw error;
    const detail = error instanceof Error ? error.message : 'stream failed';
    throw new ServerError(`The chat stream failed: ${detail}`, { cause: error });
  } finally {
    reader.releaseLock();
  }
}

function* drain(
  buffer: string,
  flush: boolean,
): Generator<unknown, { rest: string; done: boolean }> {
  let rest = buffer;
  let newline = rest.indexOf('\n');
  while (newline !== -1) {
    const line = rest.slice(0, newline).replace(/\r$/u, '');
    rest = rest.slice(newline + 1);
    const event = parseDataLine(line);
    if (event === DONE) return { rest: '', done: true };
    if (event !== undefined) yield event;
    newline = rest.indexOf('\n');
  }
  if (flush) {
    const line = rest.replace(/\r$/u, '').trim();
    if (line) {
      const event = parseDataLine(line);
      if (event === DONE) return { rest: '', done: true };
      if (event !== undefined) yield event;
    }
    return { rest: '', done: false };
  }
  return { rest, done: false };
}

function parseDataLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return undefined;
  if (!trimmed.startsWith('data:')) return undefined;
  const data = trimmed.slice('data:'.length).trim();
  if (!data) return undefined;
  if (data === '[DONE]') return DONE;
  try {
    return JSON.parse(data) as unknown;
  } catch (cause) {
    throw new ServerError('The gateway sent a stream event that was not valid JSON.', { cause });
  }
}
