"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** SMS/email alert signup widget (client-side confirmation only). */
export function NewsletterForm() {
  const [subscribed, setSubscribed] = useState(false);

  return (
    <div className="rounded-xl bg-primary p-6 text-white">
      <h3 className="mb-4 text-xl font-semibold">Stay Notified</h3>
      <p className="mb-6 text-sm opacity-90">
        Receive weekly news summaries and urgent alerts directly to your phone via SMS or Email.
      </p>
      {subscribed ? (
        <p className="flex items-center gap-2 rounded bg-white/10 p-3 text-sm font-semibold">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          You&apos;re subscribed. Salamat po!
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubscribed(true);
          }}
        >
          <label htmlFor="newsletter-mobile" className="sr-only">
            Mobile number
          </label>
          <input
            id="newsletter-mobile"
            type="tel"
            required
            placeholder="Mobile Number"
            className="w-full rounded border border-white/20 bg-white/10 px-4 py-2 text-white outline-none transition-all placeholder:text-white/60 focus:ring-2 focus:ring-accent-soft"
          />
          <Button type="submit" variant="accent" className="w-full">
            Join Channel
          </Button>
        </form>
      )}
    </div>
  );
}
