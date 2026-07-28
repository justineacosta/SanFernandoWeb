"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { getSessionUser, getSessionUserIgnoringIdle } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, recordRateLimitHit, requestIp } from "@/lib/rate-limit";
import {
  ACTIVITY_COOKIE,
  ACTIVITY_COOKIE_PATH,
  activityCookieOptions,
  forwardedProtoIsHttps,
} from "@/lib/session-activity";

export interface AuthFormState {
  error: string | null;
}

/** Tighter than the public forms' hour-long windows — credential-stuffing arrives fast. */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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

  // Two keys: IP stops one source hammering many accounts, email stops a
  // distributed attempt against one account. Both are checked (not
  // short-circuited) so both budgets are read regardless of which one an
  // attacker is closer to tripping.
  //
  // This check is read-only (isRateLimited, not checkRateLimit): a hit is
  // recorded below ONLY when signInWithPassword or the profile check
  // actually fails. Counting every attempt — including successful ones,
  // which is what the old checkRateLimit-before-signIn shape did — would
  // lock a legitimate admin out after their 6th successful login in 15
  // minutes. The threat model here is repeated FAILURES (credential
  // stuffing), not usage volume.
  const ip = await requestIp();
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${normalizedEmail}`;
  const ipLimited = await isRateLimited(ipKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const emailLimited = await isRateLimited(emailKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (ipLimited || emailLimited) {
    // Same copy as a real bad password — a distinct "too many attempts"
    // message would confirm to an attacker that their guesses were arriving.
    return { error: "Incorrect email or password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // A failed attempt is exactly what should count against the budget —
    // record it on both keys before returning, mirroring the read above.
    await recordRateLimitHit(ipKey);
    await recordRateLimitHit(emailKey);
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_active, is_archived")
    .eq("id", data.user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) {
    // A disabled account still counts as a failed attempt for rate-limiting
    // purposes — the credentials may have been correct, but no session
    // should have resulted, same as a bad password.
    await recordRateLimitHit(ipKey);
    await recordRateLimitHit(emailKey);
    await supabase.auth.signOut();
    return { error: "This account is disabled. Contact the barangay administrator." };
  }

  // Success: record nothing on either key. Proceed to the idle-cookie/
  // audit-log/redirect logic below unchanged.

  // Open the idle window. Without this the very next page GET would see no
  // activity cookie and bounce the user straight back to the login page.
  //
  // `secure` is derived from the request's own protocol, the same rule the
  // other two writers use (Proxy reads `nextUrl.protocol`, the client
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
  cookieStore.delete({ name: ACTIVITY_COOKIE, path: ACTIVITY_COOKIE_PATH });
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
