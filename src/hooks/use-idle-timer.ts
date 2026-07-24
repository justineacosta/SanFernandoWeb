"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_STORAGE_KEY,
  HEARTBEAT_THROTTLE_MS,
  activityCookieString,
  isIdleExpired,
  parseActivityAt,
  secondsUntilSignOut,
  shouldWarn,
} from "@/lib/session-activity";

/**
 * The client half of the inactivity timeout (spec §4.1).
 *
 * Effects only — every number and predicate lives in
 * `src/lib/session-activity.ts`, the same split `useFormDraft` uses.
 *
 * Two things are written on each throttled beat, for two different readers:
 *
 *   1. the `sf-activity` cookie — read by the server's two gates;
 *   2. `localStorage[sf-admin-activity-at]` — read by OTHER TABS.
 *
 * The second exists because a presence-only cookie cannot answer "how fresh?",
 * and a background tab needs exactly that to know whether the foreground tab is
 * still being used. Without it, a tab left open behind the one you are working
 * in would warn and sign you out mid-sentence. Cookie for the server,
 * localStorage for the countdown — each mechanism reads one clock.
 */

/** `mousemove` is excluded on purpose: an idle mouse nudged by a desk bump fires it forever. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll"] as const;

const TICK_MS = 1000;

function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing can throw. Losing cross-tab sync must never cost the
    // user the ability to keep working — the cookie is unaffected.
  }
}

function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface IdleTimerState {
  /** True once the final minute begins. */
  warning: boolean;
  /** Whole seconds until sign-out, for the countdown. */
  secondsLeft: number;
  /** Dismiss the warning and slide the window forward. */
  stayActive: () => void;
}

export function useIdleTimer({ onExpire }: { onExpire: () => void }): IdleTimerState {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Seeded to 0, not Date.now(): calling an impure function during render
  // fails the react-hooks/purity rule (Next 16's compiler-safety lint). The
  // real value is captured in the mount effect below, before it is ever read.
  const lastActivityRef = useRef(0);
  const lastBeatRef = useRef(0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  /** Slide the window forward. `force` bypasses the throttle for deliberate acts. */
  const record = useCallback((force = false) => {
    if (expiredRef.current) return;
    const now = Date.now();
    lastActivityRef.current = now;
    if (!force && now - lastBeatRef.current < HEARTBEAT_THROTTLE_MS) return;
    lastBeatRef.current = now;
    document.cookie = activityCookieString(window.location.protocol === "https:");
    writeItem(ACTIVITY_STORAGE_KEY, String(now));
  }, []);

  const stayActive = useCallback(() => {
    setWarning(false);
    record(true);
  }, [record]);

  useEffect(() => {
    // Capture "now" here, not in the useRef initializer above — this runs in
    // an effect, where an impure call is allowed.
    lastActivityRef.current = Date.now();

    // Seed from whatever another tab last recorded, so a newly opened tab does
    // not reset a window that is already most of the way through.
    const stored = parseActivityAt(readItem(ACTIVITY_STORAGE_KEY));
    if (stored && stored < lastActivityRef.current) lastActivityRef.current = stored;
    record(true);

    const onActivity = () => record();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    // Another tab moved: adopt its timestamp and drop out of the warning.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_STORAGE_KEY) return;
      const at = parseActivityAt(event.newValue);
      if (!at || at <= lastActivityRef.current) return;
      lastActivityRef.current = at;
      setWarning(false);
    };
    window.addEventListener("storage", onStorage);

    const evaluate = () => {
      if (expiredRef.current) return;
      const now = Date.now();
      const at = lastActivityRef.current;
      if (isIdleExpired(at, now)) {
        expiredRef.current = true;
        setSecondsLeft(0);
        onExpireRef.current();
        return;
      }
      setWarning(shouldWarn(at, now));
      setSecondsLeft(secondsUntilSignOut(at, now));
    };

    const interval = window.setInterval(evaluate, TICK_MS);
    // A backgrounded tab has its timers throttled, so the deadline can pass
    // unnoticed. Re-evaluate the moment it comes back — returning to a tab is
    // not itself activity, so this checks without recording.
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    evaluate();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [record]);

  return { warning, secondsLeft, stayActive };
}
