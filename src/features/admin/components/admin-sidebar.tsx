"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { SPRING_INDICATOR } from "@/lib/motion";
import { SITE } from "@/constants/site";
import { groupNavItems } from "@/lib/admin-nav";
import { countForNavHref, permittedQueues } from "@/lib/notifications";
import { Tooltip } from "@/components/ui/tooltip";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { useNotifications } from "./notification-provider";
import { NavCountBadge } from "./nav-count-badge";

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
  const { counts } = useNotifications();
  const permitted = permittedQueues({ isSuperAdmin, permissions });

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
        // Leave and blur are the aside's, not the inner wrapper's, so moving
        // from the nav onto the toggle — which overhangs, and is a sibling of
        // that wrapper — never counts as leaving. Open lives on the wrapper;
        // see the comment there.
        onMouseLeave={scheduleClose}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) closePeek();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && peeked) closePeek();
        }}
        className={cn(
          // The right edge is an inset shadow, not a border, so that the
          // collapsed rail's content box is exactly 40px — the number this
          // layout is built on (h-10 rows, the 40px seal, the 40px hover
          // pill). A 1px border-r left 39px, and preflight's max-width:100%
          // then clamped the seal to 39 collapsed and 40 peeked: a resize
          // under the pointer, which is precisely what must not happen.
          // The z-index lives here rather than in the caller's className, and
          // it outranks the top bar (z-40) in every state. Peeked, the panel
          // spans 256px while the bar starts near 104px, so anything lower
          // gets painted over. At rest the two do not overlap — except that
          // the toggle overhangs into the bar's box, and the bar would eat
          // the clicks on that half. Still under an open Drawer (z-50).
          "relative z-45 flex h-screen flex-col bg-ink-950 text-ink-300 transition-[width] duration-200 ease-out-soft motion-reduce:transition-none",
          expanded ? "w-64" : "w-18",
          peeked
            ? "shadow-[inset_-1px_0_0_rgb(255_255_255/0.1),8px_0_40px_rgb(0_0_0/0.45)]"
            : "shadow-[inset_-1px_0_0_rgb(255_255_255/0.1),4px_0_24px_rgb(0_0_0/0.25)]",
          className,
        )}
      >
        {/* The scroll lives in here, not on the aside, so the edge-mounted
            toggle can overhang the rail instead of being clipped by it.
            This is also the peek's open trigger, deliberately excluding the
            toggle: the toggle rides the panel's edge, so if hovering it
            opened the peek it would slide 184px out from under the pointer
            that was aiming at it — and focus-on-mousedown moving it between
            mousedown and mouseup would stop the click landing at all. */}
        <div
          onMouseEnter={openPeek}
          onFocus={openPeek}
          className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          {/* Nothing in the rail may move, resize or re-align between the two
              states — a peek opens under the pointer, so anything that shifts
              takes the row you were aiming at out from under you. The seal
              keeps one size and one x, every icon keeps its x (px-4 here plus
              px-2.5 on the row puts it at 26px in both, dead-centre of the
              72px rail), and the group headings hold a fixed height. Only the
              labels appear. */}
          <div className="relative mb-4 flex items-center gap-3 border-b border-white/10 px-4 pb-5">
            <Image
              src={SITE.sealImage}
              alt={`${SITE.name} seal`}
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/20"
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
            <nav className="relative flex flex-1 flex-col gap-6 px-4 pt-1">
              {groups.map((section, index) => (
                <div key={section.group}>
                  {/* One fixed-height box in both states. Collapsed, 72px has
                      no room for the word but does have room for the grouping,
                      so the heading becomes a hairline rule — at the same
                      height, or every row below it would jump on peek. */}
                  <p className="mb-2 flex h-4 items-center gap-2">
                    {expanded ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-px w-4 shrink-0 bg-brand-400/40"
                        />
                        <span className="truncate text-[0.65rem] font-bold uppercase tracking-[0.22em] text-ink-500">
                          {section.label}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="sr-only">{section.label}</span>
                        {/* The header's border already rules off the first group. */}
                        {index > 0 ? (
                          <span aria-hidden="true" className="h-px w-full bg-white/10" />
                        ) : null}
                      </>
                    )}
                  </p>
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
                            // px-2.5 in both states: the row is exactly 40px
                            // wide inside the collapsed rail, so this is both
                            // the centred icon button it was and the left
                            // inset of the expanded row.
                            "group relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors duration-(--duration-quick)",
                            isActive
                              ? "text-white"
                              : "text-ink-300 hover:bg-white/5 hover:text-white",
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
                          <span className="relative shrink-0">
                            <Icon
                              className={cn("h-5 w-5", isActive && "text-brand-400")}
                              aria-hidden="true"
                            />
                            {!expanded ? (
                              <NavCountBadge
                                count={countForNavHref(counts, permitted, item.href)}
                                collapsed
                              />
                            ) : null}
                          </span>
                          {/* One span whose class changes, never two spans
                              swapped: see the li below for why identity here
                              is worth protecting. */}
                          <span className={expanded ? "relative truncate" : "sr-only"}>
                            {item.label}
                          </span>
                          {expanded ? (
                            <NavCountBadge count={countForNavHref(counts, permitted, item.href)} />
                          ) : null}
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
                        <li key={item.href}>{link}</li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </LayoutGroup>
        </div>

        {onToggle ? (
          // A half-disc handle flush against the rail's right edge, so it reads
          // as a tab on the edge rather than a header control. The wrapper
          // carries the placement because Tooltip measures its own span: hang
          // the positioning off the button and that span collapses to zero,
          // taking the tooltip somewhere else entirely.
          //
          // -right-5 puts the tab entirely outside the rail (it was -right-3.5,
          // half of the old 28px disc, which straddled the border instead).
          // border-l-0 stops the flat edge being outlined against the rail it
          // is meant to be part of, and the shadow points right because that is
          // now the only side light falls off.
          <div className="absolute -right-5 top-11 z-10 -translate-y-1/2">
            <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                type="button"
                onClick={handleToggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="flex h-10 w-5 items-center justify-center rounded-r-full border border-l-0 border-white/15 bg-ink-950 text-ink-400 shadow-[2px_0_10px_rgb(0_0_0/0.4)] transition-colors duration-(--duration-quick) hover:border-brand-400/50 hover:bg-ink-900 hover:text-brand-400"
              >
                {/*
                  A panel glyph is unreadable across 20px of usable width. The
                  chevron points the way the click moves the rail.
                */}
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          </div>
        ) : null}
      </aside>
    </MotionConfig>
  );
}
