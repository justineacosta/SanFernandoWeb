import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can call the auth admin API.
 * Server-only; callers MUST verify SuperAdmin/permission first (lib/auth.ts).
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
