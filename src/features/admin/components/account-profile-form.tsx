"use client";

import { useState, useTransition } from "react";
import type { SessionUser } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { updateMyProfile } from "@/features/admin/actions/account";

export function AccountProfileForm({ currentUser }: { currentUser: SessionUser }) {
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState(currentUser.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateMyProfile({ fullName, phone });
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Profile saved.");
    });
  }

  return (
    <>
      <div className="flex flex-col gap-6 border-t border-ink-200/70 pt-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <Avatar src={currentUser.avatarSrc} fullName={currentUser.fullName} size="lg" />
          <span className="text-xs text-ink-500">Photo upload coming soon</span>
        </div>
        <form onSubmit={submit} noValidate className="flex-1 space-y-4">
          <Field label="Full Name" htmlFor="account-name">
            <Input
              id="account-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email Address" htmlFor="account-email">
              <Input id="account-email" type="email" value={currentUser.email} disabled readOnly />
              <p className="text-xs text-ink-500">Contact a SuperAdmin to change your email.</p>
            </Field>
            <Field label="Contact Number" htmlFor="account-phone">
              <Input
                id="account-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(077) 000-0000"
              />
            </Field>
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Profile"}
            </Button>
          </div>
        </form>
      </div>
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
