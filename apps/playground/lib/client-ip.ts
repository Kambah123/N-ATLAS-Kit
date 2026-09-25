/** Best-effort client address for the in-memory limiter. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 80);
  return 'unknown';
}
