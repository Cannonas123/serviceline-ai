// Lightweight in-memory fixed-window rate limiter. Good enough to stop
// brute-force/spam on a single instance. For multi-instance production, back
// this with Redis (same interface) so limits are shared across instances.

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, e] of buckets) if (now > e.resetAt) buckets.delete(k);
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const e = buckets.get(key);
  if (!e || now > e.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  e.count++;
  if (e.count > max) {
    return { allowed: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (falls back to a constant locally). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

export function tooMany(retryAfter: number) {
  return new Response(
    JSON.stringify({ error: "Too many attempts. Please wait and try again." }),
    {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
    },
  );
}
