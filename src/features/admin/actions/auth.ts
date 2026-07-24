"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { getSessionUser, getSessionUserIgnoringIdle } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACTIVITY_COOKIE,
  activityCookieOptions,
  forwardedProtoIsHttps,
} from "@/lib/session-activity";

export interface AuthFormState {
  error: string | null;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_active, is_archived")
    .eq("id", data.user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) {
    await supabase.auth.signOut();
    return { error: "This account is disabled. Contact the barangay administrator." };
  }

  // Open the idle window. Without this the very next page GET would see no
  // activity cookie and bounce the user straight back to the login page.
  //
  // `secure` is derived from the request's own protocol, the same rule the
  // other two writers use (middleware reads `nextUrl.protocol`, the client
  // heartbeat reads `window.location.protocol`). Deriving it from NODE_ENV
  // instead would agree with them on Vercel and disagree anywhere else — an
  // https staging box running a dev build would drop this cookie on the floor
  // and land the user back on the login page immediately after signing in.
  const requestHeaders = await headers();
  const secure = forwardedProtoIsHttps(requestHeaders.get("x-forwarded-proto"));
  const cookieStore = await cookies();
  cookieStore.set(activityCookieOptions(secure));

  // Before the redirect: redirect() throws, so anything after it never runs.
  // A rejected sign-in is deliberately NOT logged — failed attempts against a
  // guessed address would let anyone append rows to an append-only table.
  await recordActivity(
    { id: data.user.id, fullName: profile.full_name },
    { type: "login", action: "signed in", entityType: "session", entityId: data.user.id },
  );

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  // Resolve the actor BEFORE signing out — afterwards there is no session to
  // attribute the entry to.
  const actor = await getSessionUser();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  if (actor) {
    await recordActivity(actor, {
      type: "logout",
      action: "signed out",
      entityType: "session",
      entityId: actor.id,
    });
  }
  redirect("/admin/login");
}

/**
 * Sign out because the idle deadline passed, called by <IdleTimeout />.
 *
 * Distinct from `signOut` only in how it resolves the actor and what it logs.
 * By the time this fires the activity cookie has already expired, so
 * `getSessionUser` would return null and the audit entry would be lost — hence
 * `getSessionUserIgnoringIdle`, whose sole purpose this is.
 *
 * The closed-window path has no counterpart here and records nothing: there is
 * no session running to attribute an entry to.
 */
export async function signOutIdle(): Promise<void> {
  const actor = await getSessionUserIgnoringIdle();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete({ name: ACTIVITY_COOKIE, path: "/admin" });
  if (actor) {
    await recordActivity(actor, {
      type: "logout",
      action: "signed out",
      entityType: "session",
      entityId: actor.id,
      detail: "signed out for inactivity",
    });
  }
  redirect("/admin/login?reason=timeout");
}
