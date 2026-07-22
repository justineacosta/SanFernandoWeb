"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { FADE_QUICK, POP } from "@/lib/motion";
import { groupNavItems } from "@/lib/admin-nav";
import { useDisclosure } from "@/hooks/use-disclosure";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

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
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpen ? (
            // The layer is click-through; only the scrim and the card take
            // taps, so the topbar's own X stays live in the strip above them.
            <motion.div
              key="admin-mobile-menu-layer"
              className="pointer-events-none fixed inset-0 z-50"
            >
              <motion.button
                type="button"
                aria-label="Close admin menu"
                onClick={close}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_QUICK}
                // Starts level with the card: the topbar's bottom edge is at
                // 72px (pt-4 + h-14) and must not be dimmed.
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
                className="pointer-events-auto absolute inset-x-4 top-18 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-ink-200/70 bg-white/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl"
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
                                    isActive ? "text-brand-600" : "text-ink-400",
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.nav>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
