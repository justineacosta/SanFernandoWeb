"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { EMPTY_NOTIFICATION_COUNTS, type NotificationSnapshot } from "@/lib/notifications";
import { markNotificationsSeen } from "@/features/admin/actions/notifications";

const POLL_MS = 60_000;

interface NotificationContextValue extends NotificationSnapshot {
  /** Optimistically clears the dot and stamps the server in the background. */
  markSeen: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Single source of notification state for the sidebar badges, the mobile
 * nav card and the bell — one 60s poll feeds all three, not three separate
 * polls.
 *
 * Seeded from a server-rendered snapshot (the portal layout's
 * `getNotificationSnapshot` call) so first paint already has correct
 * numbers, the same reason `AdminShell`'s collapsed state is seeded from a
 * cookie rather than read in an effect after paint.
 *
 * Realtime is not available (every table has RLS enabled with zero
 * policies, so a browser subscription would receive nothing) — polling is
 * not a shortcut here, it is the only option.
 *
 * A 401 (idle timeout or signed out) stops the poll silently.
 * `<IdleTimeout />` owns the warning dialog and the sign-out redirect; a
 * second component reacting to the same condition with its own toast or
 * redirect would race it.
 */
export function NotificationProvider({
  initial,
  children,
}: {
  initial: NotificationSnapshot;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>(initial);
  const stoppedRef = useRef(false);

  const refetch = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (response.status === 401) {
        stoppedRef.current = true;
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as NotificationSnapshot;
      setSnapshot(data);
    } catch {
      // A dropped network request leaves the last-known snapshot on screen;
      // the next 60s tick or focus event retries.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refetch, POLL_MS);
    window.addEventListener("focus", refetch);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refetch);
    };
  }, [refetch]);

  const markSeen = useCallback(() => {
    setSnapshot((current) => ({ ...current, seenAt: new Date().toISOString() }));
    void markNotificationsSeen().catch(() => {});
  }, []);

  return (
    <NotificationContext.Provider value={{ ...snapshot, markSeen }}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Falls back to an all-empty snapshot outside the provider rather than
 * throwing: every real consumer is mounted inside the portal layout, but a
 * badge or the bell rendering as "nothing pending" in a misuse case is a far
 * cheaper failure than a crashed page.
 */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  return (
    context ?? {
      counts: EMPTY_NOTIFICATION_COUNTS,
      recent: [],
      seenAt: null,
      markSeen: () => {},
    }
  );
}
