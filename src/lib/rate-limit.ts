import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
 * validation as the real correctness gate. For the one fail-closed-sensitive
 * caller (admin login, added in the hardening pass) this is still safe: if
 * Supabase itself is unreachable, signInWithPassword fails too, so there is
 * no window where brute-forcing succeeds because rate limiting alone is down.
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

  // Opportunistic sweep, ~1% of calls: keeps the table from growing forever
  // without a scheduled job. 24h is comfortably past every window this file's
  // callers use (the widest is 1 hour).
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from("rate_limit_hits").delete().lt("hit_at", cutoff);
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
