import { clientIp } from '@/lib/client-ip';
import { getConfig } from '@/lib/config';
import { errorJson } from '@/lib/http';
import { NOT_CONFIGURED_MESSAGE } from '@/lib/languages';
import { RATE_LIMITS } from '@/lib/limits';
import { rateLimit } from '@/lib/rate-limit';
import { isChatLanguage, isRecord } from '@/lib/types';
import { UpstreamError, fetchUpstream, upstreamErrorResponse } from '@/lib/upstream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_TEXT = 800;

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const limit = rateLimit(`speech:${ip}`, RATE_LIMITS.speech.limit, RATE_LIMITS.speech.windowMs);
  if (!limit.ok) {
    return errorJson(
      429,
      'rate_limited',
      'Too many spoken replies from this network. Wait a minute.',
      {
        'Retry-After': String(limit.retryAfterSec),
      },
    );
  }

  const config = getConfig();
  if (!config) return errorJson(503, 'not_configured', NOT_CONFIGURED_MESSAGE);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(400, 'invalid_request', 'Speech requests must be JSON.');
  }
  if (
    !isRecord(body) ||
    typeof body.text !== 'string' ||
    typeof body.language !== 'string' ||
    !isChatLanguage(body.language)
  ) {
    return errorJson(400, 'invalid_request', 'Send text and a language (ha, ig, yo, en, or pcm).');
  }
  const text = body.text.trim();
  if (!text) return errorJson(400, 'invalid_request', 'There is nothing to read out.');
  if (text.length > MAX_TEXT) {
    return errorJson(400, 'invalid_request', `Keep spoken text under ${MAX_TEXT} characters.`);
  }

  try {
    const response = await fetchUpstream(config.endpoints.speechUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text, language: body.language }),
      timeoutMs: 60_000,
      trustedOrigin: config.endpoints.trustedOrigin,
    });

    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.includes('audio')) {
      const bytes = await response.arrayBuffer();
      const headers = new Headers({
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store',
      });
      const voice = response.headers.get('x-natlas-voice');
      const note = response.headers.get('x-natlas-voice-note');
      if (voice) headers.set('X-Natlas-Voice', voice);
      if (note) headers.set('X-Natlas-Voice-Note', note);
      return new Response(bytes, { status: 200, headers });
    }

    if (response.status === 404 || response.status === 501) {
      return errorJson(
        501,
        'speech_unavailable',
        'The gateway has no speech voice yet. Redeploy Modal to enable Hausa, Igbo, Yorùbá, and English voices.',
      );
    }
    return await upstreamErrorResponse(response, config.apiKey);
  } catch (error) {
    if (error instanceof UpstreamError) {
      return errorJson(error.status, error.code, error.message);
    }
    return errorJson(502, 'upstream', 'Could not reach the speech voice.');
  }
}
