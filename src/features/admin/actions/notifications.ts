"use server";

import { NOT_FOUND, getSessionUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

/**
 * Stamps `profiles.notifications_seen_at` for the caller. Clears the bell's
 * dot and nothing else — the nav badges are unhandled-work counts and only
 * move when a record's own status changes, never on a read.
 *
 * `getSessionUser`, not `requirePermission`: this is a personal preference
 * write, not gated by any module permission — every signed-in staff member
 * may clear their own bell.
 */
export async function markNotificationsSeen(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "Could not update notifications." };
  return { error: null };
}
