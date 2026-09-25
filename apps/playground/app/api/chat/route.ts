import { clientIp } from '@/lib/client-ip';
import { getConfig } from '@/lib/config';
import { errorJson, relayEventStream } from '@/lib/http';
import { NOT_CONFIGURED_MESSAGE, WAKING_MESSAGE } from '@/lib/languages';
import { MAX_INFLIGHT_PER_IP, RATE_LIMITS, upstreamTimeoutMs } from '@/lib/limits';
import { rateLimit, release, tryAcquire } from '@/lib/rate-limit';
import { UpstreamError, fetchUpstream, upstreamErrorResponse } from '@/lib/upstream';
import { validateChatRequest } from '@/lib/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const limit = rateLimit(`chat:${ip}`, RATE_LIMITS.chat.limit, RATE_LIMITS.chat.windowMs);
  if (!limit.ok) {
    return errorJson(
      429,
      'rate_limited',
      'Too many chats from this network. Wait a minute and try again.',
      {
        'Retry-After': String(limit.retryAfterSec),
      },
    );
  }

  const config = getConfig();
  if (!config) {
    return errorJson(503, 'not_configured', NOT_CONFIGURED_MESSAGE);
  }

  const raw = await request.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return errorJson(400, 'invalid_request', 'Request body must be JSON.');
  }
  const validated = validateChatRequest(parsed, raw.length);
  if (!validated.ok) {
    return errorJson(400, 'invalid_request', validated.message);
  }

  const slot = `chat:${ip}`;
  if (!tryAcquire(slot, MAX_INFLIGHT_PER_IP)) {
    return errorJson(
      429,
      'busy',
      'You already have a chat in progress. Let it finish, then try again.',
    );
  }

  let handedOff = false;
  const finish = () => release(slot);

  try {
    const response = await fetchUpstream(config.endpoints.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validated.body),
      timeoutMs: upstreamTimeoutMs(),
      trustedOrigin: config.endpoints.trustedOrigin,
    });

    if (response.status >= 400) {
      return upstreamErrorResponse(response, config.apiKey);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (validated.body.stream && contentType.includes('text/event-stream') && response.body) {
      const streamed = relayEventStream(response, finish);
      handedOff = true;
      return streamed;
    }

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': contentType || 'application/json; charset=utf-8' },
    });
  } catch (error) {
    if (error instanceof UpstreamError && error.code === 'timeout') {
      return errorJson(504, 'waking', WAKING_MESSAGE);
    }
    if (error instanceof UpstreamError) {
      return errorJson(error.status, error.code, error.message);
    }
    return errorJson(502, 'upstream', 'Something went wrong talking to N-ATLaS.');
  } finally {
    if (!handedOff) finish();
  }
}
