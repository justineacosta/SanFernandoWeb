"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/shared/turnstile-widget";
import { signIn, type SignInFormState } from "@/features/admin/actions/auth";

const initialState: SignInFormState = { error: null, challengeRequired: false };

export function LoginForm() {
  // Both responsive trees in `admin/login/page.tsx` render `<LoginForm />`
  // simultaneously (CSS `display:none`, not conditional mounting), so a
  // hardcoded id would collide across the two copies in the DOM — derive a
  // per-instance id instead, the same pattern `sortable-list.tsx` uses for
  // its `DndContext` id.
  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  // `useActionState` gives no setter to clear `state.error` directly, so a
  // manual dismiss is tracked by comparing object identity, not the message
  // text — a second failed attempt produces a new `state` even if the copy
  // reads the same, and that new state must still show.
  const [dismissedState, setDismissedState] = useState<SignInFormState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;

  // The token rides in a hidden input rather than being passed to the action
  // directly: this form is `useActionState` + a native `<form action={...}>`,
  // so there is no handleSubmit to inject it in the way the 8 public forms do.
  const [token, setToken] = useState<string | null>(null);
  const widgetRef = useRef<TurnstileWidgetHandle>(null);

  // Cloudflare tokens are single-use, so the widget must be reset after every
  // attempt. Keyed on `state` IDENTITY, not on the error text — a second
  // failure produces a new state object even when the copy reads the same,
  // the same reason `dismissedState` compares identity below.
  //
  // This only ever fires on a failure: a successful sign-in ends in
  // `redirect()`, which throws NEXT_REDIRECT and never produces a new state.
  // That keeps this clear of the standing rule that this file must not wrap
  // its action call in a catch.
  useEffect(() => {
    if (state === initialState) return;
    widgetRef.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(null);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
      <div>
        <label htmlFor={passwordId} className="mb-1 block text-sm font-semibold text-ink-700">
          Password
        </label>
        <PasswordInput
          id={passwordId}
          name="password"
          autoComplete="current-password"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-ink-600">
          <Checkbox name="remember" defaultChecked className="h-4 w-4 accent-brand-500" />
          Remember me
        </label>
        <Link
          href="/admin/forgot-password"
          className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Forgot password?
        </Link>
      </div>
      {state.challengeRequired ? (
        <>
          <input type="hidden" name="turnstileToken" value={token ?? ""} />
          <TurnstileWidget ref={widgetRef} onVerify={setToken} size="compact" />
        </>
      ) : null}
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          "Signing in…"
        ) : (
          <>
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
