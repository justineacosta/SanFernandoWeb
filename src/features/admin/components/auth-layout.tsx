import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Newspaper, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { SITE } from "@/constants/site";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Eyebrow } from "@/components/ui/eyebrow";
import trickOrTreatPhoto from "@/images/loginpageImage/TrickOrTreat.jpg";

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

interface AuthLayoutProps {
  /** Shown under the "San Fernando" heading in both trees, e.g. "Sign in to continue". */
  subtitle: string;
  /** Optional status banner (timeout notice, reset-success notice) rendered above children. */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * Shared split-screen chrome for every admin auth page (login, forgot-password,
 * reset-password) — desktop split-screen at md:+ (768px), a separate centered-
 * card layout below it. Extracted from the original login page.tsx during the
 * forgot-password work (2026-07-31 design spec) so three pages don't
 * triplicate this JSX.
 *
 * `children` is interpolated in BOTH trees below (mobile card and desktop form
 * panel), which mounts it as two independent component instances — the same
 * thing the original login page did by writing `<LoginForm />` out twice.
 * Any child using `useId()` for its input ids (as `LoginForm`/`ForgotPasswordForm`/
 * `ResetPasswordForm` all do) gets two distinct ids automatically; a hardcoded
 * id would collide.
 */
export function AuthLayout({ subtitle, banner, children }: AuthLayoutProps) {
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
              <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
            </div>
          </div>
          {banner}
          {children}
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
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink-950/70" />
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
            <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
            <div className="mt-8 text-left">
              {banner}
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
