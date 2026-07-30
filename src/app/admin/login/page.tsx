import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ClipboardList, Newspaper, Settings } from "lucide-react";
import { SITE } from "@/constants/site";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LoginForm } from "@/features/admin/components/login-form";
import trickOrTreatPhoto from "@/images/loginpageImage/TrickOrTreat.jpg";

export const metadata: Metadata = { title: "Log in" };

const PORTAL_FEATURES = [
  {
    icon: ClipboardList,
    label: "Requests",
    description: "Applications, appointments, complaints & assistance in one queue.",
  },
  {
    icon: Newspaper,
    label: "Content",
    description: "News, notices, events & transparency records.",
  },
  {
    icon: Settings,
    label: "System",
    description: "Users, permissions & settings.",
  },
] as const;

function TimeoutBanner({ reason }: { reason?: string }) {
  if (reason !== "timeout") return null;
  return (
    <p role="status" className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700">
      You were signed out because of inactivity. Please sign in again.
    </p>
  );
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="min-h-screen md:overflow-hidden">
      {/* Mobile (< md): centered-card layout. */}
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 md:hidden">
        <Image
          src={trickOrTreatPhoto}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover blur-[2px]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink-950/70" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl"
        />
        <div className="relative w-full max-w-sm rounded-3xl border border-ink-200/70 bg-white p-8 shadow-floating">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
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
          <TimeoutBanner reason={reason} />
          <LoginForm />
        </div>
      </div>

      {/* Desktop (md+): split-screen layout. */}
      <div className="hidden md:flex md:min-h-screen">
        <div className="relative flex w-[55%] shrink-0 flex-col justify-between overflow-hidden bg-ink-950 p-12">
          <Image
            src={trickOrTreatPhoto}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="(min-width: 768px) 55vw, 100vw"
            className="scale-105 object-cover blur-[2px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-ink-950/70"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 size-[36rem] rounded-full bg-brand-500/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <Image
            src={SITE.sealImage}
            alt=""
            aria-hidden="true"
            width={480}
            height={480}
            className="pointer-events-none absolute -bottom-24 -left-24 h-[28rem] w-[28rem] object-contain opacity-[0.06]"
          />

          <div className="relative">
            <div className="mb-8">
              <Eyebrow tone="dark">Barangay Portal</Eyebrow>
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">
              San Fernando – &ldquo;Onse&rdquo;
              <br />
              San Nicolas, Ilocos Norte
            </h1>
            <p className="mt-4 max-w-xs text-sm text-ink-300">
              The staff portal for managing resident requests, transparency records, and
              community services.
            </p>
          </div>

          <ul className="relative flex flex-col gap-6">
            {PORTAL_FEATURES.map(({ icon: Icon, label, description }) => (
              <li key={label} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-sm text-ink-400">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-1 justify-center overflow-y-auto bg-ink-50 px-8">
          <Link
            href="/"
            className="absolute bottom-8 left-8 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
          <div className="my-auto w-full max-w-sm -translate-y-10 text-center">
            <div className="mb-6 flex items-center justify-center">
              <Image
                src={SITE.sealImage}
                alt={`${SITE.name} seal`}
                width={240}
                height={240}
                className="h-60 w-60 rounded-full object-cover"
              />
            </div>
            <Eyebrow className="mb-2 justify-center">Barangay Portal</Eyebrow>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
              <BrandStroke>San Fernando</BrandStroke>
            </h2>
            <p className="mt-2 text-sm text-ink-500">Sign in to continue</p>
            <div className="mt-8 text-left">
              <TimeoutBanner reason={reason} />
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
