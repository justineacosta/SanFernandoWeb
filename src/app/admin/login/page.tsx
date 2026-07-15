import Image from "next/image";
import type { Metadata } from "next";
import { SITE } from "@/constants/site";
import { LoginForm } from "@/features/admin/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
          />
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Barangay Portal
            </h1>
            <p className="text-sm text-ink-500">Sign in to continue</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
