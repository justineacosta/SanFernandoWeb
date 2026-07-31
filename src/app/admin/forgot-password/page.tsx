import type { Metadata } from "next";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { ForgotPasswordForm } from "@/features/admin/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout subtitle="Reset your password">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
