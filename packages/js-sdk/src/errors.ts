/**
 * Typed failures from the N-ATLaS gateway, or from the client before a
 * request is sent. The SDK never puts the API key, the prompt, or the
 * transcript into these messages.
 */

export type ErrorCode =
  'auth' | 'rate_limit' | 'bad_request' | 'server' | 'network' | 'timeout' | 'abort' | 'error';

export interface NAtlasErrorOptions {
  status?: number | null;
  requestId?: string | null;
  body?: unknown;
  cause?: unknown;
}

/**
 * Base class for every error raised by `n-atlas`.
 *
 * `status` is the HTTP status when the gateway responded, and `null` for
 * local failures (bad arguments, network, timeout, abort). `requestId` is
 * the gateway's `X-Request-Id` when one was sent back.
 */
export class NAtlasError extends Error {
  readonly status: number | null;
  readonly requestId: string | null;
  readonly body: unknown;
  readonly code: ErrorCode;

  constructor(message: string, options: NAtlasErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.body = options.body ?? null;
    this.code = 'error';
  }
}

/** 401 or 403. The API key is missing, malformed, or not accepted. */
export class AuthError extends NAtlasError {
  override readonly code = 'auth' as const;
}

/** 429. `retryAfterMs` comes from the `Retry-After` header when it is present. */
export class RateLimitError extends NAtlasError {
  override readonly code = 'rate_limit' as const;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: NAtlasErrorOptions & { retryAfterMs?: number | null } = {},
  ) {
    super(message, options);
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

/** 400, 404, 413, 422, and any other 4xx that is not auth or rate limiting. */
export class BadRequestError extends NAtlasError {
  override readonly code = 'bad_request' as const;
}

/** 5xx, including a gateway 502 when vLLM or ASR is unreachable. */
export class ServerError extends NAtlasError {
  override readonly code = 'server' as const;
}

/** DNS, connection, or other transport failure. The request may not have arrived. */
export class NetworkError extends NAtlasError {
  override readonly code = 'network' as const;
}

/** The configured timeout elapsed before the gateway finished responding. */
export class TimeoutError extends NAtlasError {
  override readonly code = 'timeout' as const;
}

/** The caller's `AbortSignal` fired. This is never retried. */
export class AbortError extends NAtlasError {
  override readonly code = 'abort' as const;
}

export function isNAtlasError(error: unknown): error is NAtlasError {
  return error instanceof NAtlasError;
}
