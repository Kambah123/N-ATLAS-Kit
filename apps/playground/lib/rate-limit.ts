type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();
const inflight = new Map<string, number>();

export type RateLimitResult = {
  ok: boolean;
  retryAfterSec: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((stamp) => now - stamp < windowMs);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5_000) {
    for (const [entryKey, entry] of buckets) {
      if (entry.timestamps.every((stamp) => now - stamp >= windowMs)) buckets.delete(entryKey);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

export function tryAcquire(key: string, max: number): boolean {
  const current = inflight.get(key) ?? 0;
  if (current >= max) return false;
  inflight.set(key, current + 1);
  return true;
}

export function release(key: string): void {
  const current = inflight.get(key) ?? 0;
  if (current <= 1) inflight.delete(key);
  else inflight.set(key, current - 1);
}

export function resetRateLimits(): void {
  buckets.clear();
  inflight.clear();
}
