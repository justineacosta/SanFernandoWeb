"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackPanel } from "./feedback-panel";

/**
 * The floating trigger, mounted once in PublicShell.
 *
 * `z-40` sits under the header's z-50 and well under the dialog layer (z-70), so
 * it never floats above the panel it opened. It is a sibling of the header
 * rather than a child, which matters: the chrome bars carry `backdrop-filter`,
 * and that establishes a containing block that would break `position: fixed`
 * for anything nested inside them.
 *
 * The collapse/expand is a CSS max-width transition at --duration-quick, not
 * Motion: it is a micro-interaction, and the three-pattern system keeps those in
 * CSS. It expands on focus-visible as well as hover so a keyboard user gets the
 * same disclosure. Below `sm` the label never expands — a phone has no hover and
 * the pill would cover content.
 */
export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Send feedback about this website"
        className={cn(
          "group fixed bottom-6 right-6 z-40 flex h-14 items-center rounded-full bg-brand-500 px-4 text-ink-900 shadow-floating transition-all duration-(--duration-quick) ease-out-soft",
          "hover:bg-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.98]",
          open && "pointer-events-none opacity-0",
        )}
      >
        <MessageSquarePlus className="h-6 w-6 shrink-0" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-(--duration-quick) ease-out-soft sm:group-hover:ml-2 sm:group-hover:max-w-32 sm:group-focus-visible:ml-2 sm:group-focus-visible:max-w-32"
        >
          Feedback
        </span>
      </button>
      <FeedbackPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
