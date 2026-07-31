"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { requestPasswordReset, type RequestResetState } from "@/features/admin/actions/auth";

const initialState: RequestResetState = { error: null, submitted: false };

// Same generic copy for every outcome (found, not found, inactive account,
// rate-limited) — see requestPasswordReset's own comment in auth.ts. Defined
// here rather than exported from auth.ts because a "use server" file may
// only export async functions; a plain string constant export breaks the
// whole module for every importer, including the login page.
const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password.";

export function ForgotPasswordForm() {
  const uid = useId();
  const emailId = `${uid}-email`;
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);
  // Same object-identity dismiss trick as LoginForm — useActionState gives no
  // setter to clear `state.error` directly.
  const [dismissedState, setDismissedState] = useState<RequestResetState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  // Turnstile tokens are single-use; reset after every completed action call
  // (success or failure). `state` changes identity on every dispatch,
  // including the initial mount (where it equals `initialState` and the
  // widget hasn't rendered yet, making this a harmless no-op). There is no
  // synchronous "action just resolved" hook to use instead — unlike the
  // public forms' manual startTransition()+finally pattern, useActionState's
  // native form-action dispatch only surfaces completion via a state change,
  // so this effect (synchronizing the hidden input with the imperative
  // Turnstile widget it wraps, the same external-system case React's own
  // effect docs describe) is the only place to clear the spent token.
  useEffect(() => {
    turnstileRef.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurnstileToken(null);
  }, [state]);

  if (state.submitted) {
    return (
      <div className="text-center">
        <p className="text-sm text-ink-600">{GENERIC_RESET_MESSAGE}</p>
        <Link
          href="/admin/login"
          className="mt-6 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-ink-500">
        Enter the email address on your staff account and we&apos;ll send you a link to reset
        your password.
      </p>
      <div>
        <label htmlFor={emailId} className="mb-1 block text-sm font-semibold text-ink-700">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <input type="hidden" name="turnstileToken" value={turnstileToken ?? ""} />
      <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          "Sending…"
        ) : (
          <>
            Send reset link
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
      <Link
        href="/admin/login"
        className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to login
      </Link>
    </form>
  );
}
