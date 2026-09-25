/**
 * fetch wrapper: timeouts, abort, retries with backoff, and the error
 * hierarchy. Idempotent GETs retry by default. POSTs (chat, transcription)
 * retry only when the caller sets `maxRetries` on that call, or turns on
 * `retryNonIdempotent`, because a retry can run the model twice.
 */

import {
  AbortError,
  AuthError,
  BadRequestError,
  NAtlasError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  type NAtlasErrorOptions,
} from './errors.js';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface HttpClientOptions {
  apiKey: string | null;
  timeoutMs: number;
  maxRetries: number;
  retryNonIdempotent: boolean;
  fetch: FetchLike;
  sleep: Sleep;
  /** Returns a number in [0, 1). Used for retry jitter. */
  random: () => number;
  userAgent: string;
}

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  idempotent: boolean;
  json?: unknown;
  body?: BodyInit;
  accept?: string;
  /** Status codes that count as success even though they are not 2xx. */
  acceptStatuses?: readonly number[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
}

const RETRY_BASE_MS = 200;
const RETRY_CAP_MS = 8_000;
const RETRY_JITTER_MS = 100;

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new AbortError('The request was aborted.'));
    }
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async send(request: HttpRequest): Promise<Response> {
    const retries = this.attemptBudget(request);
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (request.signal?.aborted) {
        throw new AbortError('The request was aborted.');
      }
      try {
        const response = await this.once(request, timeoutMs);
        if (this.isSuccess(response, request.acceptStatuses)) {
          return response;
        }
        const error = await errorFromResponse(response);
        if (attempt < retries && isRetryable(error)) {
          await this.options.sleep(delayMs(attempt, error, this.options.random), request.signal);
          continue;
        }
        throw error;
      } catch (caught) {
        if (isHttpFailure(caught)) throw caught;
        const error = caught instanceof NAtlasError ? caught : mapThrown(caught);
        if (attempt < retries && isRetryable(error)) {
          await this.options.sleep(delayMs(attempt, error, this.options.random), request.signal);
          continue;
        }
        throw error;
      }
    }

    throw new NAtlasError('Request failed without a response.');
  }

  private attemptBudget(request: HttpRequest): number {
    if (request.maxRetries !== undefined) return request.maxRetries;
    if (!request.idempotent && !this.options.retryNonIdempotent) return 0;
    return this.options.maxRetries;
  }

  private isSuccess(response: Response, acceptStatuses: readonly number[] | undefined): boolean {
    if (response.ok) return true;
    return acceptStatuses?.includes(response.status) ?? false;
  }

  private async once(request: HttpRequest, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    let abortKind: 'timeout' | 'user' | null = null;
    const timer = setTimeout(() => {
      abortKind = 'timeout';
      controller.abort();
    }, timeoutMs);
    const detach = linkSignal(request.signal, () => {
      abortKind = 'user';
      controller.abort();
    });

    const init: RequestInit = {
      method: request.method,
      headers: this.headers(request),
      signal: controller.signal,
    };
    const body = this.body(request);
    if (body !== undefined) init.body = body;

    try {
      return await this.options.fetch(request.url, init);
    } catch (caught) {
      if (abortKind === 'timeout') {
        throw new TimeoutError(`Request timed out after ${String(timeoutMs)} ms.`);
      }
      if (abortKind === 'user' || isAbortLike(caught)) {
        throw new AbortError('The request was aborted.', { cause: caught });
      }
      throw mapThrown(caught);
    } finally {
      clearTimeout(timer);
      detach();
    }
  }

  private headers(request: HttpRequest): Headers {
    const headers = new Headers();
    if (this.options.apiKey) {
      headers.set('Authorization', `Bearer ${this.options.apiKey}`);
    }
    headers.set('Accept', request.accept ?? 'application/json');
    if (!isBrowser()) {
      headers.set('User-Agent', this.options.userAgent);
    }
    if (request.json !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  private body(request: HttpRequest): BodyInit | undefined {
    if (request.json !== undefined) return JSON.stringify(request.json);
    return request.body;
  }
}

export function isRetryable(error: NAtlasError): boolean {
  if (error instanceof AbortError) return false;
  if (error instanceof AuthError) return false;
  if (error instanceof BadRequestError) return false;
  return (
    error instanceof RateLimitError ||
    error instanceof TimeoutError ||
    error instanceof NetworkError ||
    error instanceof ServerError
  );
}

export function delayMs(attempt: number, error: NAtlasError, random: () => number): number {
  if (error instanceof RateLimitError && error.retryAfterMs !== null) {
    return error.retryAfterMs;
  }
  const exponential = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  const jitter = Math.floor(random() * RETRY_JITTER_MS);
  return exponential + jitter;
}

function linkSignal(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => undefined;
  if (signal.aborted) {
    onAbort();
    return () => undefined;
  }
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function isBrowser(): boolean {
  return typeof globalThis.document !== 'undefined';
}

/** Errors already built from an HTTP response. The retry loop must not wrap them again. */
function isHttpFailure(error: unknown): error is NAtlasError {
  return error instanceof NAtlasError && error.status !== null;
}

function isAbortLike(error: unknown): boolean {
  return isRecord(error) && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function errorFromResponse(response: Response): Promise<NAtlasError> {
  const body = await readBody(response);
  const requestId = response.headers.get('x-request-id');
  const fallback = `Request failed with HTTP ${String(response.status)}.`;
  const message = messageFromBody(body, fallback);
  const options: NAtlasErrorOptions = {
    status: response.status,
    requestId,
    body,
  };
  if (response.status === 401 || response.status === 403) {
    return new AuthError(message, options);
  }
  if (response.status === 429) {
    return new RateLimitError(message, {
      ...options,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
    });
  }
  if (response.status === 408) {
    return new TimeoutError(message, options);
  }
  if (response.status >= 400 && response.status < 500) {
    return new BadRequestError(message, options);
  }
  return new ServerError(message, options);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get('content-type') ?? '';
  const trimmed = text.trim();
  if (contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

export function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (!isRecord(body)) return fallback;
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;
  if (Array.isArray(body.detail)) {
    const parts = body.detail.map((item) => {
      if (isRecord(item) && typeof item.msg === 'string') return item.msg;
      return JSON.stringify(item);
    });
    if (parts.length > 0) return parts.join('; ');
  }
  if (isRecord(body.error) && typeof body.error.message === 'string' && body.error.message.trim()) {
    return body.error.message;
  }
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(header);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

function mapThrown(error: unknown): NAtlasError {
  if (error instanceof NAtlasError) return error;
  if (isAbortLike(error)) {
    return new AbortError('The request was aborted.', { cause: error });
  }
  const detail = error instanceof Error ? error.message : 'request failed';
  return new NetworkError(`Network error: ${detail}`, { cause: error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
