import { isRecord } from '@/lib/types';

export class UpstreamError extends Error {
  readonly status: number;
  readonly code: 'timeout' | 'network' | 'redirect';

  constructor(status: number, code: 'timeout' | 'network' | 'redirect', message: string) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.code = code;
  }
}

export type UpstreamInit = {
  method: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  timeoutMs: number;
  trustedOrigin: string;
  /** Health probes surface a 303 immediately so the UI can say the model is waking. */
  followRedirects?: boolean;
  signal?: AbortSignal;
};

const REDIRECT = new Set([301, 302, 303, 307, 308]);

function redirectDelayMs(): number {
  return process.env.VITEST ? 0 : 800;
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error('The request was aborted.');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Fetch the gateway, following the HTTP 303 Modal returns while a
 * scale-to-zero container is warming. Authorization is sent only to the
 * configured gateway origin, never to a redirect host.
 */
export async function fetchUpstream(url: string, init: UpstreamInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  const onCallerAbort = () => controller.abort();
  init.signal?.addEventListener('abort', onCallerAbort);

  let current = url;
  let method = init.method.toUpperCase();
  let body = init.body ?? null;
  const baseHeaders = new Headers(init.headers);
  const follow = init.followRedirects !== false;

  try {
    for (let hop = 0; hop < 6; hop += 1) {
      const target = new URL(current);
      const headers = new Headers(baseHeaders);
      if (target.origin !== init.trustedOrigin) headers.delete('authorization');
      if (method === 'GET' || method === 'HEAD') headers.delete('content-type');

      let response: Response;
      try {
        response = await fetch(current, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' || body == null ? null : body,
          redirect: 'manual',
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw new UpstreamError(
            504,
            'timeout',
            'The model is still waking up. The first request can take about two minutes.',
          );
        }
        throw new UpstreamError(
          502,
          'network',
          'Could not reach the N-ATLaS gateway. Check NATLAS_BASE_URL and try again.',
        );
      }

      if (!REDIRECT.has(response.status)) return response;
      if (!follow) return response;

      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        throw new UpstreamError(502, 'redirect', 'The model host redirected without a location.');
      }
      current = new URL(location, current).toString();
      if (response.status === 301 || response.status === 302 || response.status === 303) {
        method = 'GET';
        body = null;
      }
      await pause(redirectDelayMs(), controller.signal);
    }
    throw new UpstreamError(
      502,
      'redirect',
      'The model host kept redirecting while waking up. Try again in a moment.',
    );
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new UpstreamError(
        504,
        'timeout',
        'The model is still waking up. The first request can take about two minutes.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onCallerAbort);
  }
}

export function sanitizeUpstreamMessage(text: string, secret: string): string {
  const sliced = text.slice(0, 1_200);
  if (secret && sliced.includes(secret)) {
    return 'The model host rejected the request.';
  }
  try {
    const parsed: unknown = JSON.parse(sliced);
    if (!isRecord(parsed)) return 'The model host returned an error.';
    const fromDetail = detailText(parsed.detail);
    if (fromDetail) return clip(fromDetail, secret);
    const error = parsed.error;
    if (isRecord(error) && typeof error.message === 'string') return clip(error.message, secret);
    if (typeof parsed.message === 'string') return clip(parsed.message, secret);
  } catch {
    if (sliced.trim().startsWith('<')) return 'The model host returned an error.';
  }
  const plain = sliced.replace(/\s+/g, ' ').trim();
  if (!plain || plain.length > 300) return 'The model host returned an error.';
  return clip(plain, secret);
}

function detailText(detail: unknown): string | null {
  if (typeof detail === 'string') return detail;
  if (!Array.isArray(detail)) return null;
  const parts = detail
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isRecord(item) && typeof item.msg === 'string') return item.msg;
      return '';
    })
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(' ') : null;
}

function clip(value: string, secret: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (secret && trimmed.includes(secret)) return 'The model host rejected the request.';
  return trimmed || 'The model host returned an error.';
}

export async function upstreamErrorResponse(response: Response, secret: string): Promise<Response> {
  const text = await response.text().catch(() => '');
  const message =
    response.status === 401
      ? 'The playground could not sign in to N-ATLaS. Check the server NATLAS_API_KEY.'
      : sanitizeUpstreamMessage(text, secret);
  const status = response.status >= 400 && response.status < 500 ? response.status : 502;
  return Response.json(
    { error: { code: status === 401 ? 'upstream_auth' : 'upstream', message } },
    { status: status === 401 ? 502 : status },
  );
}
