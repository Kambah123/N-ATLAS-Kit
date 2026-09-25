/** Abuse limits for the public playground. Enforced in route handlers. */

export const MAX_MESSAGE_CHARS = 8_000;
export const MAX_MESSAGES = 32;
export const MAX_TOTAL_CHARS = 24_000;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 1;
export const DEFAULT_TEMPERATURE = 0.6;
export const MIN_MAX_TOKENS = 16;
export const MAX_MAX_TOKENS = 1024;
export const DEFAULT_MAX_TOKENS = 512;
export const MAX_JSON_BYTES = 100_000;

/** Compressed voice notes stay well under this; it also caps WAV length. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 120;

export const RATE_LIMITS = {
  chat: { limit: 30, windowMs: 10 * 60 * 1000 },
  transcribe: { limit: 10, windowMs: 10 * 60 * 1000 },
  health: { limit: 90, windowMs: 10 * 60 * 1000 },
} as const;

export const MAX_INFLIGHT_PER_IP = 2;

export const DEFAULT_HEALTH_TIMEOUT_MS = 8_000;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 180_000;

function readTimeout(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 500 || parsed > 300_000) return fallback;
  return parsed;
}

export function healthTimeoutMs(): number {
  return readTimeout('NATLAS_HEALTH_TIMEOUT_MS', DEFAULT_HEALTH_TIMEOUT_MS);
}

export function upstreamTimeoutMs(): number {
  return readTimeout('NATLAS_UPSTREAM_TIMEOUT_MS', DEFAULT_UPSTREAM_TIMEOUT_MS);
}
