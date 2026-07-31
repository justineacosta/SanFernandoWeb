"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { getSessionUser, getSessionUserIgnoringIdle } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, isRateLimited, recordRateLimitHit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { EMAIL_SITE_URL } from "@/emails/site-url";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

export interface RequestResetState {
  error: string | null;
  submitted: boolean;
}

// The generic "if an account exists..." copy shown for every outcome (found,
// not found, inactive, rate-limited) lives in ForgotPasswordForm, not here —
// a "use server" file may only export async functions, so a plain string
// constant can't be exported alongside requestPasswordReset (Next's compiler
// rejects the whole module, breaking every page that imports it, including
// /admin/login). The action itself never returns this copy as `error`; it
// returns `{ error: null, submitted: true }` and the form shows its own copy
// whenever `submitted` is true.

/** Tighter than the public forms' hour-long windows, matching admin login's own caution. */
const RESET_LIMIT = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

const resetRequestSchema = z.object({ email: z.string().email() });

/**
 * Request a password-reset link. Public, unauthenticated — anyone can submit
 * any email. ALWAYS returns the same generic response regardless of whether
 * the email matches a real, active account, or whether the rate limit was
 * hit — differing copy or timing here would let a script enumerate valid
 * staff emails. See the 2026-07-31 forgot-password design spec.
 */
export async function requestPasswordReset(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const ip = await requestIp();
  const turnstileToken = formData.get("turnstileToken");
  if (!(await verifyTurnstileToken(typeof turnstileToken === "string" ? turnstileToken : null, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, submitted: false };
  }

  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address.", submitted: false };
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  // Record-on-every-call (checkRateLimit), NOT signIn's isRateLimited/
  // recordRateLimitHit split: every request must count identically whether
  // or not the email matches a real account, or differential counting
  // itself becomes an enumeration signal. Two keys, same IP+email shape as
  // signIn's own limiter.
  const ipOk = await checkRateLimit(`reset:ip:${ip}`, RESET_LIMIT, RESET_WINDOW_MS);
  const emailOk = await checkRateLimit(`reset:email:${normalizedEmail}`, RESET_LIMIT, RESET_WINDOW_MS);
  if (!ipOk || !emailOk) {
    // Still the generic response — a distinct "too many requests" message
    // would itself confirm requests against this email were being processed.
    return { error: null, submitted: true };
  }

  // generateLink is the account-existence check, not a separate `profiles`
  // query by email: `profiles.email` isn't guaranteed to be stored in the
  // same case Supabase Auth normalizes `auth.users.email` to (createTeamUser
  // inserts whatever case the SuperAdmin typed), so looking it up by email
  // risks a false "no such account" for an existing user typed in a
  // different case. generateLink asks Supabase Auth directly and hands back
  // the matching user's id, which is then used for an exact `profiles` id
  // lookup below.
  const admin = createSupabaseAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: { redirectTo: `${EMAIL_SITE_URL}/admin/reset-password` },
  });

  if (!linkError && linkData?.user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, is_active, is_archived")
      .eq("id", linkData.user.id)
      .maybeSingle();

    if (profile && profile.is_active && !profile.is_archived) {
      await sendEmail({
        to: normalizedEmail,
        subject: "Reset your password — Barangay San Fernando",
        template: PasswordResetEmail({ resetUrl: linkData.properties.action_link }),
      });
      await recordActivity(
        { id: linkData.user.id, fullName: profile.full_name },
        {
          type: "password_reset",
          action: "requested a password reset",
          entityType: "account",
          entityId: linkData.user.id,
        },
      );
    }
  }

  return { error: null, submitted: true };
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
