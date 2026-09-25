import { clientIp } from '@/lib/client-ip';
import { getConfig } from '@/lib/config';
import { RATE_LIMITS, healthTimeoutMs } from '@/lib/limits';
import { WAKING_MESSAGE, NOT_CONFIGURED_MESSAGE } from '@/lib/languages';
import { rateLimit } from '@/lib/rate-limit';
import { isRecord } from '@/lib/types';
import { UpstreamError, fetchUpstream } from '@/lib/upstream';
import { errorJson } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type HealthStatus = 'unconfigured' | 'ready' | 'degraded' | 'waking' | 'offline';

function upstreamState(value: unknown): 'ok' | 'down' {
  return isRecord(value) && value.status === 'ok' ? 'ok' : 'down';
}

function healthBody(status: HealthStatus, message: string, extra?: Record<string, string>) {
  return Response.json({ status, message, ...extra });
}

export async function GET(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const limit = rateLimit(`health:${ip}`, RATE_LIMITS.health.limit, RATE_LIMITS.health.windowMs);
  if (!limit.ok) {
    return errorJson(429, 'rate_limited', 'Status is being checked too often. Try again shortly.', {
      'Retry-After': String(limit.retryAfterSec),
    });
  }

  const config = getConfig();
  if (!config) {
    return healthBody('unconfigured', NOT_CONFIGURED_MESSAGE);
  }

  try {
    const response = await fetchUpstream(config.endpoints.healthUrl, {
      method: 'GET',
      timeoutMs: healthTimeoutMs(),
      trustedOrigin: config.endpoints.trustedOrigin,
      followRedirects: false,
    });

    if (response.status === 301 || response.status === 302 || response.status === 303) {
      await response.body?.cancel().catch(() => undefined);
      return healthBody('waking', WAKING_MESSAGE);
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
    const record = isRecord(parsed) ? parsed : null;
    const llm = upstreamState(record?.llm);
    const asr = upstreamState(record?.asr);

    if (response.status === 200 && record?.status === 'ok') {
      return healthBody('ready', 'N-ATLaS is ready.', { llm, asr });
    }
    if (
      response.status === 503 ||
      record?.status === 'degraded' ||
      llm === 'down' ||
      asr === 'down'
    ) {
      if (response.ok || response.status === 503) {
        return healthBody('degraded', 'The gateway is up, but a model is still starting.', {
          llm,
          asr,
        });
      }
    }
    return healthBody('offline', 'The model host did not report a healthy status.');
  } catch (error) {
    if (error instanceof UpstreamError && error.code === 'timeout') {
      return healthBody('waking', WAKING_MESSAGE);
    }
    return healthBody('offline', 'Could not reach the N-ATLaS gateway.');
  }
}
