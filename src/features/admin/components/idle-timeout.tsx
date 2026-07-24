"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIdleTimer } from "@/hooks/use-idle-timer";
import { FADE_QUICK, POP } from "@/lib/motion";
import { signOut, signOutIdle } from "@/features/admin/actions/auth";

/**
 * The inactivity warning (spec §4).
 *
 * Mounted in app/admin/(portal)/layout.tsx as a SIBLING of AdminShell, never
 * inside it: a `position: fixed` overlay nested in the `backdrop-filter` chrome
 * gets a new containing block and stops being viewport-fixed. Same rule as the
 * public feedback widget.
 *
 * `role="alertdialog"` rather than `dialog` — this interrupts for a
 * consequential decision, and the description is announced with the title.
 * Focus starts on "Stay signed in": the safe choice, and the one a person
 * hitting Enter to dismiss a surprise dialog means. Focus management (initial
 * focus, Tab/Shift-Tab cycle, scroll lock, focus restore) mirrors
 * `ConfirmDialog`, with one deliberate difference: Escape does nothing here,
 * because closing an inactivity warning on a stray keypress would silently
 * extend the session.
 */
export function IdleTimeout() {
  const [expired, setExpired] = useState(false);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  const onExpire = useCallback(() => {
    setExpired(true);
    startTransition(() => {
      void signOutIdle();
    });
  }, []);

  const { warning, secondsLeft, stayActive } = useIdleTimer({ onExpire });
  const open = warning || expired;
  const locked = expired || pending;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus lands on "Stay signed in", not Cancel-position: the safe act here
    // is staying signed in, so a stray Enter should not sign the user out.
    stayButtonRef.current?.focus();
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape is deliberately not wired to anything: dismissing this dialog
      // on a stray keypress would silently extend the session.
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="idle"
            className="fixed inset-0 z-80 flex items-center justify-center p-4"
          >
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_QUICK}
              className="absolute inset-0 bg-ink-950/50"
            />
            <motion.div
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="idle-timeout-title"
              aria-describedby="idle-timeout-body"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={POP}
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-floating"
            >
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="idle-timeout-title"
                    className="font-display text-lg font-semibold tracking-tight text-ink-900"
                  >
                    Still there?
                  </h2>
                  <div id="idle-timeout-body" className="mt-2 text-sm text-ink-600">
                    {expired ? (
                      <p>Signing you out…</p>
                    ) : (
                      <p>
                        You have been inactive for a while. For your security you will be
                        signed out in{" "}
                        {/*
                          No aria-live: the alertdialog role already announces this
                          text (with the title) the moment the dialog opens. A live
                          region here would re-announce the count roughly once a
                          second for the whole warning window, burying the two
                          buttons under ~60 queued announcements.
                        */}
                        <span className="font-semibold text-ink-900">
                          {secondsLeft} second{secondsLeft === 1 ? "" : "s"}
                        </span>
                        .
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={() => startTransition(() => void signOut())}
                >
                  Sign out now
                </Button>
                <Button
                  ref={stayButtonRef}
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={locked}
                  onClick={stayActive}
                >
                  Stay signed in
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
