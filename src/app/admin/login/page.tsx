import Image from "next/image";
import type { Metadata } from "next";
import { SITE } from "@/constants/site";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LoginForm } from "@/features/admin/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl"
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-ink-200/70 bg-white p-8 shadow-floating">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
          />
          <div>
            <Eyebrow className="mb-2 justify-center">Barangay Portal</Eyebrow>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">
              <BrandStroke>San Fernando</BrandStroke>
            </h1>
            <p className="mt-2 text-sm text-ink-500">Sign in to continue</p>
          </div>
        </div>
        {reason === "timeout" ? (
          <p
            role="status"
            className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700"
          >
            You were signed out because of inactivity. Please sign in again.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
