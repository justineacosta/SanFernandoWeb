"use client";

import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { SITE } from "@/constants/site";
import { groupNavItems } from "@/lib/admin-nav";
import { NavLink } from "@/components/navigation/nav-link";
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
 * A client component so it can own the collapsed rendering and read
 * ADMIN_NAV_ITEMS whole. It used to be a Server Component that split each
 * item's icon out before crossing into NavLink, because an icon is a component
 * and components do not cross the RSC boundary as props; that workaround is
 * gone with the boundary.
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
  const groups = groupNavItems(ADMIN_NAV_ITEMS, { isSuperAdmin, permissions });

  return (
    <aside
      aria-label="Admin navigation"
      className={cn(
        "relative flex h-screen flex-col overflow-y-auto overflow-x-hidden border-r border-white/10 bg-ink-950 py-6 text-ink-300 transition-[width] duration-200",
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
          "relative mb-6 flex items-center gap-3",
          collapsed ? "flex-col px-2" : "px-5",
        )}
      >
        <Image
          src={SITE.sealImage}
          alt={`${SITE.name} seal`}
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-white">
              Barangay Portal
            </h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
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
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
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

      <nav className="relative flex flex-1 flex-col gap-5 px-2">
        {groups.map((section) => (
          <div key={section.group}>
            {collapsed ? (
              <div className="mx-3 mb-2 border-t border-white/10" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-widest text-ink-500">
                {section.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const link = (
                  <NavLink
                    item={{ label: item.label, href: item.href }}
                    exact={item.exact}
                    className={cn(
                      "group relative flex h-10 items-center rounded-lg text-sm font-medium text-ink-300 transition-colors hover:bg-white/5 hover:text-white",
                      collapsed ? "justify-center px-0" : "gap-3 px-3",
                    )}
                    activeClassName="bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-brand-400 [&>svg]:text-brand-400"
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
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
    </aside>
  );
}
