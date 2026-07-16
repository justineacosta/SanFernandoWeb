"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, type AuthFormState } from "@/features/admin/actions/auth";

const initialState: AuthFormState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

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
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
