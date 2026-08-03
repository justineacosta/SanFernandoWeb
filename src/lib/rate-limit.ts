import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Opportunistic sweep, ~1% of calls: keeps the table from growing forever
 * without a scheduled job. 24h is comfortably past every window this file's
 * callers use (the widest is 1 hour). Shared by every function below that
 * writes a hit, so the sweep runs regardless of which one is called.
 */
async function opportunisticSweep(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<void> {
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from("rate_limit_hits").delete().lt("hit_at", cutoff);
  }
}

/**
 * Durable sliding-window limiter backed by the rate_limit_hits table
 * (migration 0029). Replaces the earlier in-memory Map, which reset on every
 * redeploy and did not share state across serverless instances.
 *
 * True when the caller is still within budget. Records the attempt only when
 * it's within budget — a caller hammering past the limit must not keep
 * pushing its own window forward with rejected attempts.
 *
 * Fails open on a Supabase error: an outage in the rate limiter must not take
 * down the public forms it protects, which still have their own Zod
 * validation as the real correctness gate.
 *
 * This is the whole contract for every caller EXCEPT admin login, which
 * counts only failed attempts (a successful sign-in must not consume the
 * budget) — see `countRateLimitHits` / `recordRateLimitHit` below, used together
 * by `signIn` in src/features/admin/actions/auth.ts instead of this function.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await admin
    .from("rate_limit_hits")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("hit_at", since);

  if (error) {
    console.error("checkRateLimit count failed:", error.message);
    return true;
  }
  if ((count ?? 0) >= limit) return false;

  const { error: insertError } = await admin.from("rate_limit_hits").insert({ key });
  if (insertError) {
    console.error("checkRateLimit insert failed:", insertError.message);
  }

  await opportunisticSweep(admin);

  return true;
}

/**
 * Read-only hit count for a key inside a window — does NOT record a hit.
 * Returns `null` when the count could not be read (a Supabase error), so the
 * caller decides what an unknown count means rather than having a fail-open
 * default baked in here. Admin login needs opposite answers for its two
 * thresholds: see `isOverLoginLimit` / `needsChallenge` in
 * `src/features/admin/lib/login-challenge.ts`.
 *
 * Exists for admin login only. `checkRateLimit`'s check-and-record-together
 * contract would count every successful sign-in against the same budget as a
 * failed one, which is wrong — the threat this limiter defends against is
 * repeated *failures* (credential stuffing), not usage volume.
 *
 * Replaced the earlier boolean `isRateLimited(key, limit, windowMs)`: `signIn`
 * reads two thresholds off each key (>= 1 to challenge, >= LOGIN_LIMIT to
 * block), and a boolean helper meant running the same count query twice per
 * key — four round trips per login attempt instead of two.
 */
export async function countRateLimitHits(key: string, windowMs: number): Promise<number | null> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await admin
    .from("rate_limit_hits")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("hit_at", since);

  if (error) {
    console.error("countRateLimitHits count failed:", error.message);
    return null;
  }
  return count ?? 0;
}

/**
 * Records a hit unconditionally — call only after deciding the attempt should
 * count (admin login: after a failed sign-in or a disabled-account rejection,
 * never after success). Pairs with `countRateLimitHits` above.
 */
export async function recordRateLimitHit(key: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("rate_limit_hits").insert({ key });
  if (error) {
    console.error("recordRateLimitHit insert failed:", error.message);
  }

  await opportunisticSweep(admin);
}

/**
 * Caller IP from the proxy headers, or a shared fallback bucket.
 *
 * Trusts the LAST entry of X-Forwarded-For, not the first. Each hop appends
 * the IP it received the request from, so the first entry is whatever the
 * client itself claimed in the header it sent — trivially spoofable, and
 * every IP-keyed limiter (all 8 public forms, admin login's `login:ip:*` key)
 * derived its bucket from exactly that forgeable value. The last entry is the
 * IP that reached this app's own immediate reverse proxy/edge, which a client
 * cannot set. `cf-connecting-ip` is preferred when present, since Cloudflare's
 * edge always overwrites it rather than forwarding a client-supplied value.
 * This assumes exactly one trusted hop in front of the app; if this deploy is
 * ever placed behind an additional untrusted proxy, take the Nth-from-last
 * entry instead of the last.
 */
export async function requestIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const store = await headers();

  const cfIp = store.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }

  return store.get("x-real-ip")?.trim() || "unknown";
}
