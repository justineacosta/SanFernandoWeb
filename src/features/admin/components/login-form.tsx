"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, type AuthFormState } from "@/features/admin/actions/auth";

const initialState: AuthFormState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  // `useActionState` gives no setter to clear `state.error` directly, so a
  // manual dismiss is tracked by comparing object identity, not the message
  // text — a second failed attempt produces a new `state` even if the copy
  // reads the same, and that new state must still show.
  const [dismissedState, setDismissedState] = useState<AuthFormState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="login-email" className="mb-1 block text-sm font-semibold text-ink-700">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block text-sm font-semibold text-ink-700">
          Password
        </label>
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
