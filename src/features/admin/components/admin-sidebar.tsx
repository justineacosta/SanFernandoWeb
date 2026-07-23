"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { SPRING_INDICATOR } from "@/lib/motion";
import { SITE } from "@/constants/site";
import { groupNavItems } from "@/lib/admin-nav";
import { Tooltip } from "@/components/ui/tooltip";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

/** Grace period before a peek closes, so clipping the rail's edge cannot flash it. */
const PEEK_CLOSE_MS = 150;

interface AdminSidebarProps {
  /** Extra classes on the aside — used to control overlay vs. fixed rendering. */
  className?: string;
  /** Gates SuperAdmin-only nav items (e.g. Services Management). */
  isSuperAdmin: boolean;
  /** Gates permission-scoped nav items. Ignored for SuperAdmins, who hold everything. */
  permissions: Permission[];
  /** The pinned state: a 72px icon rail instead of the 256px labelled rail. */
  collapsed: boolean;
  /** Renders the collapse toggle when passed. The fixed rail is the only caller. */
  onToggle?: () => void;
}

/**
 * Left navigation rail for the admin portal.
 *
 * The active row is marked by one shared highlight that glides between links
 * on navigation (Motion `layoutId`). That indicator needs the active check to
 * live here rather than inside NavLink, so links are plain `Link`s with the
 * same exact/prefix matching NavLink uses. The `LayoutGroup` id scopes that
 * layoutId to this instance — the rail is now the only one that renders it,
 * since the mobile menu draws its own active row in CSS.
 *
 * Thirteen flat links did not scan, so they render under three group headings.
 * Collapsed, the headings become hairline rules — 72px has no room for a word
 * but does have room for the grouping.
 *
 * **Collapsed is not mute: the rail peeks open on hover.** `collapsed` is the
 * pinned state and belongs to AdminShell, which persists it and moves the main
 * column's margin with it; `peeked` is transient and belongs here, because the
 * aside is `fixed` and its width affects nothing outside itself — so a peek
 * reflows no page content and must never touch the cookie. Everything visual
 * switches on the derived `expanded`; the toggle button alone switches on
 * `collapsed`, since its job is still pin/unpin and mid-peek there is nothing
 * pinned to collapse.
 *
 * The peek is a CSS width transition, not `AnimatePresence`: unmounting the
 * panel would drop the shared-element indicator and re-run its mount on every
 * hover.
 */
export function AdminSidebar({
  className,
  isSuperAdmin,
  permissions,
  collapsed,
  onToggle,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const layoutGroup = useId();
  const groups = groupNavItems(ADMIN_NAV_ITEMS, { isSuperAdmin, permissions });

  const [peeked, setPeeked] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = !collapsed || peeked;

  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const openPeek = useCallback(() => {
    cancelClose();
    setPeeked(true);
  }, [cancelClose]);

  const closePeek = useCallback(() => {
    cancelClose();
    setPeeked(false);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPeeked(false), PEEK_CLOSE_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Collapsing while the pointer still rests on the rail has to actually
  // collapse it. Without this the pending peek would hold the panel open and
  // the click would look ignored — `mouseenter` has already fired and will not
  // fire again until the pointer leaves.
  const handleToggle = useCallback(() => {
    closePeek();
    onToggle?.();
  }, [closePeek, onToggle]);

  return (
    <MotionConfig reducedMotion="user">
      <aside
        aria-label="Admin navigation"
        onMouseEnter={openPeek}
        onMouseLeave={scheduleClose}
        // React's focus events bubble, so this covers tabbing into any row —
        // otherwise a keyboard user tabs blind through thirteen icon-only
        // links. The `contains` guard is what keeps focus moving between two
        // rows from closing the panel it is moving inside.
        onFocus={openPeek}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) closePeek();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && peeked) closePeek();
        }}
        className={cn(
          "relative flex h-screen flex-col border-r border-white/10 bg-ink-950 text-ink-300 transition-[width] duration-200 ease-out-soft motion-reduce:transition-none",
          expanded ? "w-64" : "w-18",
          // The z-index lives here rather than in the caller's className
          // because it changes with the peek: the panel spans 256px while the
          // top bar (z-40) starts around 104px, so at the rail's resting z-30
          // the bar would paint straight over it. 45 clears the bar and still
          // sits under an open Drawer (z-50).
          peeked
            ? "z-45 shadow-[8px_0_40px_rgb(0_0_0/0.45)]"
            : "z-30 shadow-[4px_0_24px_rgb(0_0_0/0.25)]",
          className,
        )}
      >
        {/* The scroll lives in here, not on the aside, so the edge-mounted
            toggle can overhang the rail instead of being clipped by it. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div
            className={cn(
              "relative mb-4 flex items-center gap-3 border-b border-white/10",
              expanded ? "px-5 pb-5" : "flex-col px-2 pb-4",
            )}
          >
            <Image
              src={SITE.sealImage}
              alt={`${SITE.name} seal`}
              width={40}
              height={40}
              className={cn(
                "shrink-0 rounded-full object-cover ring-1 ring-white/20",
                expanded ? "h-10 w-10" : "h-9 w-9",
              )}
            />
            {expanded ? (
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-base font-semibold leading-tight tracking-tight text-white">
                  Barangay Portal
                </h2>
                <p className="mt-0.5 truncate text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand-400">
                  San Fernando
                </p>
              </div>
            ) : null}
          </div>

          <LayoutGroup id={layoutGroup}>
            <nav className="relative flex flex-1 flex-col gap-6 px-2 pt-1">
              {groups.map((section, index) => (
                <div key={section.group}>
                  {expanded ? (
                    <p className="mb-2 flex items-center gap-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-ink-500 before:h-px before:w-4 before:shrink-0 before:bg-brand-400/40 before:content-['']">
                      {section.label}
                    </p>
                  ) : // The header's border already rules off the first group.
                  index > 0 ? (
                    <div className="mx-3 mb-3 border-t border-white/10" aria-hidden="true" />
                  ) : null}
                  <ul className="flex flex-col gap-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href);
                      const link = (
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "group relative flex h-10 items-center rounded-lg text-sm font-medium transition-colors duration-(--duration-quick)",
                            isActive
                              ? "text-white"
                              : "text-ink-300 hover:bg-white/5 hover:text-white",
                            expanded ? "gap-3 px-3" : "w-10 justify-center px-0",
                          )}
                        >
                          {isActive ? (
                            <motion.span
                              layoutId="active-nav"
                              aria-hidden="true"
                              transition={SPRING_INDICATOR}
                              className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-inset ring-white/10"
                            >
                              <span className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-brand-400" />
                            </motion.span>
                          ) : null}
                          <Icon
                            className={cn(
                              "relative h-5 w-5 shrink-0",
                              isActive && "text-brand-400",
                            )}
                            aria-hidden="true"
                          />
                          {/* One span whose class changes, never two spans
                              swapped: see the li below for why identity here
                              is worth protecting. */}
                          <span className={expanded ? "relative truncate" : "sr-only"}>
                            {item.label}
                          </span>
                        </Link>
                      );
                      return (
                        // These rows deliberately have no Tooltip. The peek is
                        // now the label reveal — hovering a collapsed row opens
                        // the panel and shows the real label, so a tooltip would
                        // fire underneath the opening panel and say it twice.
                        //
                        // Removing it also fixed a keyboard bug: wrapping the
                        // link only when collapsed made `expanded` swap the
                        // element type at this position, so tabbing in remounted
                        // the very link that had just been focused, dropping
                        // focus to <body>. Keep this markup identical in both
                        // states.
                        <li
                          key={item.href}
                          className={expanded ? undefined : "flex justify-center"}
                        >
                          {link}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </LayoutGroup>
        </div>

        {onToggle ? (
          // Straddles the right border, centred on the seal row, so it reads as
          // a handle on the rail's edge rather than a header control. The
          // wrapper carries the placement because Tooltip measures its own
          // span: hang the positioning off the button and that span collapses
          // to zero, taking the tooltip somewhere else entirely.
          <div className="absolute -right-3.5 top-11 z-10 -translate-y-1/2">
            <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                type="button"
                onClick={handleToggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-ink-950 text-ink-400 shadow-[0_2px_10px_rgb(0_0_0/0.4)] transition-colors duration-(--duration-quick) hover:border-brand-400/50 hover:bg-ink-900 hover:text-brand-400"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          </div>
        ) : null}
      </aside>
    </MotionConfig>
  );
}
