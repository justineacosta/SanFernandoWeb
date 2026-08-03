"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { getSessionUser, getSessionUserIgnoringIdle } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, countRateLimitHits, recordRateLimitHit, requestIp } from "@/lib/rate-limit";
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
import {
  isOverLoginLimit,
  LOGIN_WINDOW_MS,
  needsChallenge,
} from "@/features/admin/lib/login-challenge";

export interface AuthFormState {
  error: string | null;
}

export interface SignInFormState extends AuthFormState {
  /**
   * UI hint only — tells `LoginForm` to mount the Turnstile widget. NEVER a
   * security boundary: `signIn` recomputes the same condition server-side on
   * every call (Task 4), so a client that ignores this flag is refused just
   * the same. A Server Action is a public HTTP endpoint; what the previous
   * response told the client does not constrain the next POST.
   */
  challengeRequired: boolean;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signIn(
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password.", challengeRequired: false };
  }

  // Two keys: IP stops one source hammering many accounts, email stops a
  // distributed attempt against one account. Both are checked (not
  // short-circuited) so both budgets are read regardless of which one an
  // attacker is closer to tripping.
  //
  // This check is read-only (countRateLimitHits, not checkRateLimit): a hit is
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
  const ipHits = await countRateLimitHits(ipKey, LOGIN_WINDOW_MS);
  const emailHits = await countRateLimitHits(emailKey, LOGIN_WINDOW_MS);
  const challenge = needsChallenge(ipHits, emailHits);

  // NOTE the ordering: the security-hardening spec (§5) has every public form
  // verify Turnstile FIRST, before the rate limit and before Zod, so a failed
  // challenge is the cheapest possible rejection. That rule cannot hold here —
  // whether a challenge is required at all depends on state only the count
  // reads above can reveal, so they must come first. Do not "fix" this back.
  //
  // A failed challenge records NO rate-limit hit. Hits are keyed partly on
  // email, so if they counted, anyone who knows a staff address could lock
  // that person out of their own account with five tokenless POSTs.
  if (challenge) {
    const tokenValue = formData.get("turnstileToken");
    const verified = await verifyTurnstileToken(
      typeof tokenValue === "string" ? tokenValue : null,
      ip,
    );
    if (!verified) {
      // Same copy as every other rejection — never reveal which check failed.
      return { error: "Incorrect email or password.", challengeRequired: true };
    }
  }

  if (isOverLoginLimit(ipHits, emailHits)) {
    // Same copy as a real bad password — a distinct "too many attempts"
    // message would confirm to an attacker that their guesses were arriving.
    return { error: "Incorrect email or password.", challengeRequired: challenge };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // A failed attempt is exactly what should count against the budget —
    // record it on both keys before returning, mirroring the read above.
    await recordRateLimitHit(ipKey);
    await recordRateLimitHit(emailKey);
    return { error: "Incorrect email or password.", challengeRequired: true };
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
    return { error: "This account is disabled. Contact the barangay administrator.", challengeRequired: true };
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

/**
 * Wall-clock floor for every post-validation `{ error: null, submitted: true }`
 * response, timed from right after Turnstile/Zod validation passes (see
 * `start` below). Without this, the "found, active account" branch — which
 * awaits a Resend network call plus an audit-log insert — measurably takes
 * longer than every other branch that returns the identical payload right
 * away (rate-limited, unknown email, inactive/archived account). An attacker
 * could enumerate valid staff emails by timing the response instead of
 * reading its content, the same attack class the identical-payload design
 * exists to close. This is not trying to be provably constant-time — with
 * `RESET_LIMIT` capping an attacker at 3 timing samples per 15 minutes per
 * IP+email, there isn't much of a side channel to close precisely — just a
 * practical narrowing of the gap, sized to the found-active branch's typical
 * cost without making every rejected request wait out sendEmail()'s full 5s
 * timeout ceiling.
 *
 * Sized at 1200ms, not the 600 this originally shipped with: the found-active
 * branch is an admin generateLink() round trip, THEN a profiles query, THEN
 * max(one Resend call, one audit insert) — three sequential network hops that
 * plausibly exceed 600ms on their own, which would leave every over-floor
 * response leaking exactly the branch this floor exists to hide.
 */
const RESET_TIMING_FLOOR_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const resetRequestSchema = z.object({ email: z.string().email() });

/**
 * Request a password-reset link. Public, unauthenticated — anyone can submit
 * any email. ALWAYS returns the same generic response, in comparable time,
 * regardless of whether the email matches a real, active account, or
 * whether the rate limit was hit — differing copy, or a measurably
 * different response time, would let a script enumerate valid staff emails.
 * See the 2026-07-31 forgot-password design spec.
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

  // Timed from here: every branch below returns the identical
  // `{ error: null, submitted: true }` payload, so from this point on
  // wall-clock time must not leak which branch was taken either — see
  // RESET_TIMING_FLOOR_MS below, applied at the single return point.
  const start = Date.now();

  // Record-on-every-call (checkRateLimit), NOT signIn's countRateLimitHits/
  // recordRateLimitHit split: every request must count identically whether
  // or not the email matches a real account, or differential counting
  // itself becomes an enumeration signal. Two keys, same IP+email shape as
  // signIn's own limiter.
  const ipOk = await checkRateLimit(`reset:ip:${ip}`, RESET_LIMIT, RESET_WINDOW_MS);
  const emailOk = await checkRateLimit(`reset:email:${normalizedEmail}`, RESET_LIMIT, RESET_WINDOW_MS);

  if (ipOk && emailOk) {
    // generateLink is the account-existence check, not a separate `profiles`
    // query by email: `profiles.email` isn't guaranteed to be stored in the
    // same case Supabase Auth normalizes `auth.users.email` to (createTeamUser
    // inserts whatever case the SuperAdmin typed), so looking it up by email
    // risks a false "no such account" for an existing user typed in a
    // different case. generateLink asks Supabase Auth directly and hands back
    // the matching user's id, which is then used for an exact `profiles` id
    // lookup below.
    //
    // No `options.redirectTo`: we never send Supabase's own `action_link`
    // (the /auth/v1/verify?...&redirect_to=... URL that option shapes). Only
    // `properties.hashed_token` is used, and the link the resident actually
    // receives is built by this app below — so nothing here depends on the
    // project's Redirect-URL allow-list. `options` is optional on
    // GenerateRecoveryLinkParams, so it is omitted outright.
    const admin = createSupabaseAdminClient();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
    });

    if (!linkError && linkData?.user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, is_active, is_archived")
        .eq("id", linkData.user.id)
        .maybeSingle();

      if (profile && profile.is_active && !profile.is_archived) {
        // The emailed link is built here rather than taken from
        // `linkData.properties.action_link`: that action_link routes through
        // Supabase's own /auth/v1/verify endpoint, whereas this flow verifies
        // the token server-side at submit time (see resetPassword). Carrying
        // the raw `hashed_token` straight to our own page is what lets
        // verifyOtp do that without any PKCE round trip.
        const resetUrl = `${EMAIL_SITE_URL}/admin/reset-password?token_hash=${encodeURIComponent(
          linkData.properties.hashed_token,
        )}`;

        // Concurrent, not sequential — neither call depends on the other's
        // result, matching the Promise.all shape submitInquiry already uses
        // for its own independent ack-email + staff-lookup pair.
        await Promise.all([
          sendEmail({
            to: normalizedEmail,
            subject: "Reset your password — Barangay San Fernando",
            template: PasswordResetEmail({ resetUrl }),
          }),
          // Logged, even though signIn deliberately does NOT log a rejected
          // sign-in ("failed attempts against a guessed address would let
          // anyone append rows to an append-only table"). Two material
          // differences make this one safe where that one wasn't: it is
          // bounded by the email-keyed RESET_LIMIT window, so an attacker
          // cannot append at will against a single account; and every field
          // is a constant or server-derived from the matched account, so
          // there is no attacker-controlled free text to inject — the row can
          // only ever prove volume. The `detail` exists so nobody reading
          // audit_log mistakes the row for "the account holder did this":
          // an anonymous third party typing a staff address into a public
          // form produces exactly the same entry.
          recordActivity(
            { id: linkData.user.id, fullName: profile.full_name },
            {
              type: "password_reset",
              action: "requested a password reset",
              entityType: "account",
              entityId: linkData.user.id,
              detail: "requested from the public forgot-password form",
            },
          ),
        ]);
      }
    }
  }
  // Every branch above (rate-limited, unknown email, inactive/archived
  // account, found-active account) converges here on the same generic
  // response — a distinct "too many requests" message would itself confirm
  // requests against this email were being processed, and skipping the
  // timing floor below would leak the same thing through response latency
  // instead of copy.

  const elapsed = Date.now() - start;
  if (elapsed < RESET_TIMING_FLOOR_MS) {
    await delay(RESET_TIMING_FLOOR_MS - elapsed);
  }

  return { error: null, submitted: true };
}

/** Defense-in-depth against replay/brute-force of the (long, single-use, random) emailed token hash. */
const RESET_SUBMIT_LIMIT = 10;
const RESET_SUBMIT_WINDOW_MS = 15 * 60 * 1000;

const resetPasswordSchema = z
  .object({
    tokenHash: z.string().min(1),
    password: z.string().min(10, "New password needs at least 10 characters."),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * Set a new password from an emailed recovery link. Public, unauthenticated
 * by design — the `token_hash` itself, not a session, is the proof of
 * identity.
 *
 * The token is redeemed HERE, at submit time, never when the page renders:
 * corporate email "safe link" scanners pre-fetch every link in an inbound
 * email before the recipient opens it, which would silently burn Supabase's
 * single-use recovery token before the real user ever clicks. The page
 * (src/app/admin/reset-password/page.tsx) only ever reads the `token_hash`
 * search param and forwards it to a hidden input; nothing redeems it until
 * this action runs.
 *
 * Redemption is `verifyOtp({type:"recovery", token_hash})`, NOT
 * `exchangeCodeForSession`. The latter cannot work in this flow at all:
 * @supabase/ssr's createServerClient hardcodes `flowType: "pkce"` (it sets
 * the field AFTER spreading caller-supplied auth options, so it can't even be
 * overridden), and PKCE requires a code-verifier that @supabase/auth-js reads
 * from this client's own storage — a value written only by the client that
 * INITIATED the flow. Here the flow is initiated entirely server-side by the
 * service-role admin client's generateLink(), which writes nothing to the
 * resident's browser, so that verifier can never exist and every exchange
 * would throw AuthPKCECodeVerifierMissingError, even for a perfectly fresh
 * link. verifyOtp needs no verifier: it POSTs the hash to Supabase's /verify
 * endpoint and, on success, persists the returned session through this
 * client's normal cookie adapter.
 */
export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const ip = await requestIp();
  if (!(await checkRateLimit(`reset-submit:ip:${ip}`, RESET_SUBMIT_LIMIT, RESET_SUBMIT_WINDOW_MS))) {
    return { error: "Too many attempts. Please request a new reset link." };
  }

  const parsed = resetPasswordSchema.safeParse({
    tokenHash: formData.get("token_hash"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: verifyError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: parsed.data.tokenHash,
  });
  if (verifyError || !data.user) {
    return { error: "This reset link has expired or already been used. Request a new one." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    await supabase.auth.signOut();
    return { error: "Could not update your password. Request a new reset link and try again." };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  await recordActivity(
    { id: data.user.id, fullName: profile?.full_name ?? data.user.email ?? "Unknown" },
    {
      type: "password_reset",
      action: "reset password via emailed link",
      entityType: "account",
      entityId: data.user.id,
    },
  );

  // The recovery session must not linger — sign it out before redirecting so
  // this flow never leaves the browser "logged in" as a side effect. It also
  // never touches the custom `sf-activity` idle cookie signIn sets, so the
  // idle-timeout model is unaffected.
  await supabase.auth.signOut();

  redirect("/admin/login?reset=success");
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
