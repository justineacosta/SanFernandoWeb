import type { Metadata } from "next";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { LoginForm } from "@/features/admin/components/login-form";
import { countRateLimitHits, requestIp } from "@/lib/rate-limit";
import { LOGIN_WINDOW_MS, needsChallenge } from "@/features/admin/lib/login-challenge";

export const metadata: Metadata = { title: "Log in" };

function LoginStatusBanner({ reason, reset }: { reason?: string; reset?: string }) {
  if (reset === "success") {
    return (
      <p role="status" className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700">
        Your password has been reset. Sign in with your new password.
      </p>
    );
  }
  if (reason === "timeout") {
    return (
      <p role="status" className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700">
        You were signed out because of inactivity. Please sign in again.
      </p>
    );
  }
  return null;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; reset?: string }>;
}) {
  const { reason, reset } = await searchParams;

  // Only the IP key is knowable here — no email has been typed yet. Passing null
  // for the email count would fail CLOSED (needsChallenge treats null as
  // "unreadable, so challenge everyone"), which would put a widget on every
  // first load and defeat the whole point of being adaptive. 0 is the honest
  // value: this key has no recorded failures because we have not been told which
  // key to look at yet. signIn still reads the real email count at submit time.
  const ip = await requestIp();
  const ipHits = await countRateLimitHits(`login:ip:${ip}`, LOGIN_WINDOW_MS);
  const initialChallengeRequired = needsChallenge(ipHits, 0);

  return (
    <AuthLayout
      subtitle="Sign in to continue"
      banner={<LoginStatusBanner reason={reason} reset={reset} />}
    >
      <LoginForm initialChallengeRequired={initialChallengeRequired} />
    </AuthLayout>
  );
}
