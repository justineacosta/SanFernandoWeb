"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
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

interface AdminSidebarProps {
  /** Extra classes on the aside — used to control overlay vs. fixed rendering. */
  className?: string;
  /** Gates SuperAdmin-only nav items (e.g. Services Management). */
  isSuperAdmin: boolean;
  /** Gates permission-scoped nav items. Ignored for SuperAdmins, who hold everything. */
  permissions: Permission[];
  /** 72px icon rail instead of the 256px labelled rail. */
  collapsed: boolean;
  /** Omitted by the mobile drawer, which has nothing to collapse into. */
  onToggle?: () => void;
}

/**
 * Left navigation rail for the admin portal.
 *
 * The active row is marked by one shared highlight that glides between links
 * on navigation (Motion `layoutId`). That indicator needs the active check to
 * live here rather than inside NavLink, so links are plain `Link`s with the
 * same exact/prefix matching NavLink uses. The `LayoutGroup` id keeps the
 * fixed rail and the mobile drawer — both mounted at once — from fighting
 * over the same layoutId.
 *
 * Thirteen flat links did not scan, so they render under three group headings.
 * Collapsed, the headings become hairline rules — 72px has no room for a word
 * but does have room for the grouping.
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

  return (
    <MotionConfig reducedMotion="user">
      <aside
        aria-label="Admin navigation"
        className={cn(
          "relative flex h-screen flex-col overflow-y-auto overflow-x-hidden border-r border-white/10 bg-ink-950 py-6 text-ink-300 shadow-[4px_0_24px_rgb(0_0_0/0.25)] transition-[width] duration-200 ease-out-soft",
          collapsed ? "w-18" : "w-64",
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
        />
        <div
          className={cn(
            "relative mb-4 flex items-center gap-3 border-b border-white/10",
            collapsed ? "flex-col px-2 pb-4" : "px-5 pb-5",
          )}
        >
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={40}
            height={40}
            className={cn(
              "shrink-0 rounded-full object-cover ring-1 ring-white/20",
              collapsed ? "h-9 w-9" : "h-10 w-10",
            )}
          />
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-semibold leading-tight tracking-tight text-white">
                Barangay Portal
              </h2>
              <p className="mt-0.5 truncate text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand-400">
                San Fernando
              </p>
            </div>
          ) : null}
          {onToggle ? (
            <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                type="button"
                onClick={onToggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="rounded-lg p-1.5 text-ink-400 transition-colors duration-(--duration-quick) hover:bg-white/10 hover:text-white"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          ) : null}
        </div>

        <LayoutGroup id={layoutGroup}>
          <nav className="relative flex flex-1 flex-col gap-6 px-2 pt-1">
            {groups.map((section, index) => (
              <div key={section.group}>
                {collapsed ? (
                  // The header's border already rules off the first group.
                  index > 0 ? (
                    <div className="mx-3 mb-3 border-t border-white/10" aria-hidden="true" />
                  ) : null
                ) : (
                  <p className="mb-2 flex items-center gap-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-ink-500 before:h-px before:w-4 before:shrink-0 before:bg-brand-400/40 before:content-['']">
                    {section.label}
                  </p>
                )}
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
                          collapsed ? "w-10 justify-center px-0" : "gap-3 px-3",
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
                          className={cn("relative h-5 w-5 shrink-0", isActive && "text-brand-400")}
                          aria-hidden="true"
                        />
                        {!collapsed ? (
                          <span className="relative truncate">{item.label}</span>
                        ) : (
                          <span className="sr-only">{item.label}</span>
                        )}
                      </Link>
                    );
                    return (
                      // Tooltip wraps its child in an inline-flex span that shrinks
                      // to the icon, so the collapsed row has to be centred by the
                      // li rather than by the link's own justify-center.
                      <li key={item.href} className={collapsed ? "flex justify-center" : undefined}>
                        {collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </LayoutGroup>
      </aside>
    </MotionConfig>
  );
}
