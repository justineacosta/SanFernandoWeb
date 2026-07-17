/**
 * Best-effort in-memory sliding-window limiter for public endpoints.
 *
 * Deliberately unsophisticated: the map lives in one serverless instance, so a
 * determined attacker spread across cold starts gets more attempts than the
 * limit suggests. It still stops naive scripted enumeration, and it costs
 * nothing. The hardening plan (spec §12 step 8) replaces this with a durable
 * store; keep the call sites, swap the body.
 */
const hits = new Map<string, number[]>();

/** True when the caller is still within budget. Records the attempt. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep so a long-lived instance can't grow the map forever.
  if (hits.size > 5000) {
    for (const [entryKey, times] of hits) {
      if (times.every((at) => now - at >= windowMs)) hits.delete(entryKey);
    }
  }

  return true;
}

/** Caller IP from the proxy headers, or a shared fallback bucket. */
export async function requestIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}
