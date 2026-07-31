import type { Metadata } from "next";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { LoginForm } from "@/features/admin/components/login-form";

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

  return (
    <AuthLayout
      subtitle="Sign in to continue"
      banner={<LoginStatusBanner reason={reason} reset={reset} />}
    >
      <LoginForm />
    </AuthLayout>
  );
}
