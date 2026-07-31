import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { ResetPasswordForm } from "@/features/admin/components/reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <AuthLayout subtitle="Set a new password">
        <p className="text-center text-sm text-ink-600">
          This link is invalid or has expired.{" "}
          <Link
            href="/admin/forgot-password"
            className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            Request a new one
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Set a new password">
      <ResetPasswordForm code={code} />
    </AuthLayout>
  );
}
