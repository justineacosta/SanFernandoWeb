"use client";

import { useCallback, useState, useTransition } from "react";
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
 * hitting Enter to dismiss a surprise dialog means.
 */
export function IdleTimeout() {
  const [expired, setExpired] = useState(false);
  const [, startTransition] = useTransition();

  const onExpire = useCallback(() => {
    setExpired(true);
    startTransition(() => {
      void signOutIdle();
    });
  }, []);

  const { warning, secondsLeft, stayActive } = useIdleTimer({ onExpire });
  const open = warning || expired;

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
                        {/* aria-live so the count is announced without stealing focus. */}
                        <span aria-live="polite" className="font-semibold text-ink-900">
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
                  disabled={expired}
                  onClick={() => startTransition(() => void signOut())}
                >
                  Sign out now
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  autoFocus
                  disabled={expired}
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
