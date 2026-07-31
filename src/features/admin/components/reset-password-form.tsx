"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword, type AuthFormState } from "@/features/admin/actions/auth";

const initialState: AuthFormState = { error: null };

export function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const uid = useId();
  const passwordId = `${uid}-password`;
  const confirmId = `${uid}-confirm`;
  const [state, formAction, isPending] = useActionState(resetPassword, initialState);
  const [dismissedState, setDismissedState] = useState<AuthFormState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Field name must stay "token_hash" — resetPassword reads it via formData.get("token_hash"). */}
      <input type="hidden" name="token_hash" value={tokenHash} />
      <div>
        <label htmlFor={passwordId} className="mb-1 block text-sm font-semibold text-ink-700">
          New password
        </label>
        <PasswordInput
          id={passwordId}
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
        <p className="mt-1 text-xs text-ink-500">At least 10 characters.</p>
      </div>
      <div>
        <label htmlFor={confirmId} className="mb-1 block text-sm font-semibold text-ink-700">
          Confirm new password
        </label>
        <PasswordInput
          id={confirmId}
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={10}
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          "Saving…"
        ) : (
          <>
            Set new password
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
