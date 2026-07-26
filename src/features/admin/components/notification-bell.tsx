"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { Bell } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { POP } from "@/lib/motion";
import { useAnchorRect } from "@/hooks/use-anchor-rect";
import {
  NOTIFICATION_QUEUES,
  formatRelativeTime,
  hasUnseen,
  permittedQueues,
  totalUnhandled,
} from "@/lib/notifications";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { useNotifications } from "./notification-provider";

const PANEL_WIDTH = 360;
const GAP = 10;

/** The icon for a notification row, matched off the queue's own nav entry — one icon source, not two. */
function iconForHref(href: string) {
  return ADMIN_NAV_ITEMS.find((item) => item.href === href)?.icon ?? Bell;
}

interface NotificationBellProps {
  isSuperAdmin: boolean;
  permissions: Permission[];
}

/**
 * Bell in the top bar: a dot for "something arrived since you last looked",
 * and a dropdown of the newest unhandled items across every queue this
 * viewer may see.
 *
 * The portal/outside-click/Escape mechanics are copied from `RowActions`
 * (`src/components/ui/row-actions.tsx`) rather than reinvented — the same
 * `overflow-x-auto` and top-bar `backdrop-blur-md` containing-block traps
 * apply to any floating panel anchored in this portal.
 */
export function NotificationBell({ isSuperAdmin, permissions }: NotificationBellProps) {
  const { counts, recent, seenAt, markSeen } = useNotifications();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const { rect, measure } = useAnchorRect(
    triggerRef,
    open,
    useCallback(() => close(false), [close]),
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  // The panel's own onKeyDown only fires for Escape presses that originate
  // inside it, but focus stays on the trigger button after the opening
  // click — a portaled panel is a separate DOM subtree, so that keydown
  // would never bubble through it. A document-level listener, matching the
  // outside-mousedown one above, is what actually catches Escape regardless
  // of where focus is.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  const permitted = permittedQueues({ isSuperAdmin, permissions });
  const permittedSet = new Set(permitted);
  const permittedRecent = recent.filter((item) => permittedSet.has(item.queue));
  const unseen = hasUnseen(permittedRecent, seenAt);
  const unhandled = totalUnhandled(counts, permitted);

  const openPanel = () => {
    measure();
    setOpen(true);
    markSeen();
  };

  let panel: React.ReactNode = null;
  if (open && rect) {
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    panel = createPortal(
      <MotionConfig reducedMotion="user">
        <motion.div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
          initial={{ opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={POP}
          style={{ top: rect.bottom + GAP, left, width: PANEL_WIDTH, transformOrigin: "top right" }}
          className="fixed z-70 max-h-[70vh] overflow-y-auto rounded-2xl border border-ink-200/70 bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            New requests
          </p>
          {permittedRecent.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {permittedRecent.map((item) => {
                const Icon = iconForHref(NOTIFICATION_QUEUES[item.queue].navHref);
                return (
                  <li key={`${item.queue}-${item.id}`}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      onClick={() => close(false)}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-ink-50"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-900">{item.label}</span>
                        <span className="block truncate text-xs text-ink-500">{item.sublabel}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-ink-400">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </MotionConfig>,
      document.body,
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unhandled > 0 ? `Notifications, ${unhandled} unhandled` : "Notifications"}
        onClick={() => (open ? close() : openPanel())}
        className={cn(
          "relative rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900",
          open && "bg-ink-50 text-ink-900",
        )}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unseen ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white"
          />
        ) : null}
      </button>
      {panel}
    </>
  );
}
