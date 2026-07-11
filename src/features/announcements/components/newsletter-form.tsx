"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NewsletterFormProps {
  /** "card" = self-contained dark card (news sidebar); "inline" = bare form row (footer panel). */
  variant?: "card" | "inline";
}

/** SMS/email alert signup widget (client-side confirmation only). */
export function NewsletterForm({ variant = "card" }: NewsletterFormProps) {
  const [subscribed, setSubscribed] = useState(false);

  const form = subscribed ? (
    <p className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-sm font-semibold text-white">
      <CheckCircle2 className="h-5 w-5 text-brand-400" aria-hidden="true" />
      You&apos;re subscribed. Salamat po!
    </p>
  ) : (
    <form
      className={cn(variant === "card" ? "space-y-4" : "flex flex-col gap-3 sm:flex-row")}
      onSubmit={(event) => {
        event.preventDefault();
        setSubscribed(true);
      }}
    >
      <label htmlFor={`newsletter-mobile-${variant}`} className="sr-only">
        Mobile number
      </label>
      <input
        id={`newsletter-mobile-${variant}`}
        type="tel"
        required
        placeholder="Mobile Number"
        className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-white outline-none transition-colors placeholder:text-ink-400 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20"
      />
      <Button type="submit" variant="primary" className={cn(variant === "card" && "w-full")}>
        Join Channel
      </Button>
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
