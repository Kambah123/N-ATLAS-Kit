import { checkAudio } from '@/lib/audio';
import { clientIp } from '@/lib/client-ip';
import { getConfig } from '@/lib/config';
import { errorJson } from '@/lib/http';
import { NOT_CONFIGURED_MESSAGE, WAKING_MESSAGE } from '@/lib/languages';
import { MAX_AUDIO_BYTES, MAX_INFLIGHT_PER_IP, RATE_LIMITS, upstreamTimeoutMs } from '@/lib/limits';
import { rateLimit, release, tryAcquire } from '@/lib/rate-limit';
import { isAsrLanguage, isRecord } from '@/lib/types';
import { UpstreamError, fetchUpstream, upstreamErrorResponse } from '@/lib/upstream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function isUpload(value: unknown): value is Blob & { name?: string; type?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === 'function' &&
    typeof (value as Blob).size === 'number'
  );
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const limit = rateLimit(
    `transcribe:${ip}`,
    RATE_LIMITS.transcribe.limit,
    RATE_LIMITS.transcribe.windowMs,
  );
  if (!limit.ok) {
    return errorJson(
      429,
      'rate_limited',
      'Too many transcriptions from this network. Wait a minute and try again.',
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  const config = getConfig();
  if (!config) {
    return errorJson(503, 'not_configured', NOT_CONFIGURED_MESSAGE);
  }

  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_AUDIO_BYTES + 8_192) {
    return errorJson(413, 'too_large', 'Audio must be under 8 MB.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson(400, 'invalid_request', 'Upload the audio as multipart form data.');
  }

  const languageValue = form.get('language');
  if (typeof languageValue !== 'string' || !isAsrLanguage(languageValue)) {
    return errorJson(
      400,
      'invalid_request',
      'Pick a language: Hausa, Igbo, Yorùbá, or Nigerian English.',
    );
  }

  const file = form.get('file');
  if (!isUpload(file)) {
    return errorJson(400, 'invalid_request', 'Attach an audio file.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkAudio(file.name ?? 'audio', file.type ?? '', bytes);
  if (!checked.ok) {
    return errorJson(400, 'invalid_audio', checked.message);
  }

  const slot = `transcribe:${ip}`;
  if (!tryAcquire(slot, MAX_INFLIGHT_PER_IP)) {
    return errorJson(429, 'busy', 'You already have a transcription in progress.');
  }

  try {
    const outgoing = new FormData();
    outgoing.append(
      'file',
      new Blob([bytes], { type: file.type || 'application/octet-stream' }),
      checked.filename,
    );
    outgoing.append('language', languageValue);
    outgoing.append('response_format', 'json');

    const response = await fetchUpstream(config.endpoints.transcriptionsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: outgoing,
      timeoutMs: upstreamTimeoutMs(),
      trustedOrigin: config.endpoints.trustedOrigin,
    });

    if (response.status >= 400) {
      return upstreamErrorResponse(response, config.apiKey);
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return errorJson(502, 'upstream', 'The transcription response was not JSON.');
    }
    if (!isRecord(parsed) || typeof parsed.text !== 'string') {
      return errorJson(502, 'upstream', 'The transcription response did not include text.');
    }
    return Response.json({ text: parsed.text });
  } catch (error) {
    if (error instanceof UpstreamError && error.code === 'timeout') {
      return errorJson(504, 'waking', WAKING_MESSAGE);
    }
    if (error instanceof UpstreamError) {
      return errorJson(error.status, error.code, error.message);
    }
    return errorJson(502, 'upstream', 'Something went wrong transcribing that audio.');
  } finally {
    release(slot);
  }
}
