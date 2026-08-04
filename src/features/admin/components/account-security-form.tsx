"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldClasses } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { changeMyPassword } from "@/features/admin/actions/account";

export function AccountSecurityForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await changeMyPassword({ currentPassword: current, newPassword: next });
        if (result.error) {
          setError(result.error);
          return;
        }
        setCurrent("");
        setNext("");
        setConfirm("");
        showToast("Password updated.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4 border-t border-ink-200/70 pt-6">
        <Field label="Current Password" htmlFor="account-current-password">
          <PasswordInput
            id="account-current-password"
            autoComplete="current-password"
            className={fieldClasses}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        {/*
          Back to one column at xl, where Settings puts this card in a half-width
          track: two-up there wraps the "New Password (min 10 characters)" label
          onto a second line and drops its input out of line with Confirm's.
        */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Field label="New Password (min 10 characters)" htmlFor="account-new-password">
            <PasswordInput
              id="account-new-password"
              autoComplete="new-password"
              className={fieldClasses}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            <PasswordStrength value={next} />
          </Field>
          <Field label="Confirm New Password" htmlFor="account-confirm-password">
            <PasswordInput
              id="account-confirm-password"
              autoComplete="new-password"
              className={fieldClasses}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        </div>
        {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
        <div className="flex justify-end">
          <Button variant="outline" type="submit" disabled={isPending}>
            {isPending ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </form>
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
