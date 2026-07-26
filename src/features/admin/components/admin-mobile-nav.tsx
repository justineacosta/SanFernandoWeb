"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { FADE_QUICK, POP } from "@/lib/motion";
import { groupNavItems } from "@/lib/admin-nav";
import { countForNavHref, permittedQueues } from "@/lib/notifications";
import { useDisclosure } from "@/hooks/use-disclosure";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { useNotifications } from "./notification-provider";
import { NavCountBadge } from "./nav-count-badge";

/** Never fires; the store is a constant, so nothing ever needs re-reading. */
const noopSubscribe = () => () => {};

/**
 * Hamburger + floating card menu for the admin portal on small screens.
 *
 * Shaped after the public site's `MobileNav` so the site has one mobile menu
 * model, but it cannot reuse that component: `MobileNav` maps a flat constant
 * of text links, while this needs permission-gated, grouped, icon-bearing rows
 * off `groupNavItems` — the same helper the desktop rail uses, so the gate is
 * never copied.
 *
 * The active row is plain CSS, not the rail's `layoutId` shared element. The
 * card mounts fresh on every open, so a glide would have nothing to glide from,
 * and the rail is `hidden md:flex` — display-hidden but still mounted — so a
 * shared id would compete with a laid-out-but-invisible twin.
 *
 * The scrim and card portal to `document.body` and must keep doing so. This
 * component renders inside the top bar, whose `backdrop-blur-md` creates a
 * containing block for fixed-position descendants — exactly as a transform
 * would. Rendered in place, `fixed inset-0` resolves to the bar's own box, so
 * the card insets from the bar's padding edge and the scrim collapses into an
 * invisible strip.
 */
export function AdminMobileNav({
  isSuperAdmin,
  permissions,
}: {
  isSuperAdmin: boolean;
  permissions: Permission[];
}) {
  const { isOpen, toggle, close } = useDisclosure();
  const pathname = usePathname();
  const groups = groupNavItems(ADMIN_NAV_ITEMS, { isSuperAdmin, permissions });
  const { counts } = useNotifications();
  const permitted = permittedQueues({ isSuperAdmin, permissions });
  // The portal target only exists in the browser, and AnimatePresence has to
  // stay mounted across the close for the exit to run — so the portal is gated
  // on hydration rather than folded into the isOpen check. useSyncExternalStore
  // is the hydration-safe read: the server snapshot is false, the client's true.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // Rows close the menu themselves on tap, because tapping the row you are
  // already on does not change the pathname. This effect is the other half:
  // it catches browser back/forward and the global search's deep links.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  // Drives the bottom fade. Measured rather than assumed, because how much
  // fits depends on the viewport and on how many modules this viewer may see —
  // someone with two permissions has nothing to scroll and should see no hint.
  // Runs from the ref callback on open and from every scroll after that.
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const measureOverflow = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    setHasMoreBelow(
      element.scrollTop + element.clientHeight < element.scrollHeight - 1,
    );
  }, []);

  const menu = (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen ? (
          // The layer is click-through; only the scrim and the card take taps,
          // so the top bar's X stays live in the strip above them. It repeats
          // `md:hidden` because the portal escapes the wrapper that carries it.
          <motion.div
            key="admin-mobile-menu-layer"
            className="pointer-events-none fixed inset-0 z-50 md:hidden"
          >
            <motion.button
              type="button"
              aria-label="Close admin menu"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_QUICK}
              // Starts at the bar's bottom edge — 72px (pt-4 + h-14) — which
              // must not be dimmed. It stays there while the card sits lower,
              // so the gap between the two reads as dimmed page, not a gap.
              className="pointer-events-auto absolute inset-x-0 bottom-0 top-18 bg-ink-900/40 backdrop-blur-[2px]"
            />
            <motion.nav
              id="admin-mobile-menu"
              aria-label="Admin navigation"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, transition: FADE_QUICK }}
              transition={POP}
              style={{ transformOrigin: "top center" }}
              // 88px leaves a 16px gap under the bar, matching the side
              // gutter, so the card floats clear of it instead of hanging off
              // it. Capped well short of the viewport: the point is a card that
              // scrolls, not a sheet that happens to fit thirteen rows.
              //
              // The card is the chrome and does not scroll; the list inside it
              // does. That split is what lets the fade sit still at the bottom
              // edge instead of riding along with the rows.
              className="pointer-events-auto absolute inset-x-4 top-22 flex max-h-[65dvh] flex-col overflow-hidden rounded-3xl border border-ink-200/70 bg-white/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl"
            >
              <div
                ref={measureOverflow}
                onScroll={(event) => measureOverflow(event.currentTarget)}
                className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3"
              >
                <div className="flex flex-col gap-5">
                  {groups.map((section) => (
                    <div key={section.group}>
                      <p className="mb-2 flex items-center gap-2 px-4 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-ink-500 before:h-px before:w-4 before:shrink-0 before:bg-brand-400/40 before:content-['']">
                        {section.label}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={close}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                  "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition-colors duration-(--duration-quick)",
                                  isActive
                                    ? "bg-brand-50 text-ink-900"
                                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "h-5 w-5 shrink-0",
                                    isActive
                                      ? "text-brand-600"
                                      : "text-ink-400",
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
                                <NavCountBadge count={countForNavHref(counts, permitted, item.href)} />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-white via-white/70 to-transparent transition-opacity duration-(--duration-quick)",
                  hasMoreBelow ? "opacity-100" : "opacity-0",
                )}
              />
            </motion.nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls="admin-mobile-menu"
        aria-label={isOpen ? "Close admin menu" : "Open admin menu"}
        className="p-2 text-ink-900"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {hydrated ? createPortal(menu, document.body) : null}
    </div>
  );
}
