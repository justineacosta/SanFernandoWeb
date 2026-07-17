import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can call the auth admin API.
 * Server-only. Callers MUST verify SuperAdmin/permission first (lib/auth.ts),
 * unless they are a deliberately-public action that gates in code instead — see
 * `submitApplication` and `lookupTicket`, which are unauthenticated by design
 * and carry their own validation, rate limiting, and privacy checks.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
