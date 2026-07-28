"use client";

import { useId, useRef, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { normaliseMobile } from "@/lib/public-forms";
import { Button } from "@/components/ui/button";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { subscribeToAlerts } from "@/features/announcements/actions";

interface NewsletterFormProps {
  /** "card" = self-contained dark card (news sidebar); "inline" = bare form row (footer panel). */
  variant?: "card" | "inline";
}

/** SMS/email alert signup. Persists to `alert_subscribers`. */
export function NewsletterForm({ variant = "card" }: NewsletterFormProps) {
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  // Both variants render on the same page (sidebar + footer), so the ids have
  // to be unique per instance, not per variant.
  const inputId = useId();
  const errorId = `${inputId}-error`;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    // Same check the action runs, so a mistyped number costs no round trip.
    if (!normaliseMobile(mobile)) {
      setError("Enter a mobile number like 0917 555 0101.");
      return;
    }
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await subscribeToAlerts(mobile, turnstileToken);
        if (result.error) {
          setError(result.error);
          return;
        }
        setSubscribed(true);
      } finally {
        submitting.current = false;
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    });
  }

  const form = subscribed ? (
    <p className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-sm font-semibold text-white">
      <CheckCircle2 className="h-5 w-5 text-brand-400" aria-hidden="true" />
      You&apos;re subscribed. Salamat po!
    </p>
  ) : (
    <form
      className={cn(variant === "card" ? "space-y-4" : "space-y-3")}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className={cn(variant === "card" ? "space-y-4" : "flex flex-col gap-3 sm:flex-row")}>
        <label htmlFor={inputId} className="sr-only">
          Mobile number
        </label>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Mobile Number"
          value={mobile}
          onChange={(event) => {
            setMobile(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-white outline-none transition-colors placeholder:text-ink-400 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20 aria-invalid:border-danger-bright aria-invalid:focus-visible:border-danger-bright aria-invalid:focus-visible:ring-danger-bright/20"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={isPending}
          className={cn(variant === "card" && "w-full")}
        >
          {isPending ? "Joining…" : "Join Channel"}
        </Button>
      </div>
      <TurnstileWidget
        ref={turnstileRef}
        onVerify={setTurnstileToken}
        size={variant === "inline" ? "compact" : "normal"}
        className={cn("flex", variant === "card" ? "justify-center" : "justify-start")}
      />
      {error ? (
        // `danger-bright`, not `danger`: this form only ever renders on dark ink.
        <p id={errorId} role="alert" className="text-sm font-medium text-danger-bright">
          {error}
        </p>
      ) : null}
    </form>
  );

  if (variant === "inline") {
    return form;
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-500/30 blur-3xl"
      />
      <div className="relative">
        <h3 className="mb-4 font-display text-xl font-semibold tracking-tight">Stay Notified</h3>
        <p className="mb-6 text-sm text-ink-300">
          Receive weekly news summaries and urgent alerts directly to your phone via SMS or Email.
        </p>
        {form}
      </div>
    </div>
  );
}
