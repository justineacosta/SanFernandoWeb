"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { adminPageTitle } from "@/lib/admin-nav";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { AdminGlobalSearch } from "@/features/admin/components/admin-global-search";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";
import { SignOutButton } from "@/features/admin/components/sign-out-button";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Floating app bar for the admin portal: current page, search, profile.
 *
 * Styled after the public site's header (`SiteHeader`) — a rounded, blurred
 * bar that takes its border and shadow only once there is content behind it,
 * rather than a flat white strip wearing a hard rule at all times.
 *
 * The title is the current page rather than "San Fernando Admin", which the
 * sidebar already says. `adminPageTitle` is permission-gated: this bar renders
 * above the portal's 404, so an ungated lookup would name a module the viewer
 * is not supposed to know exists.
 *
 * Notifications and Help used to sit here. Both were stubs wired to nothing.
 */
export function AdminTopBar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const title = adminPageTitle(ADMIN_NAV_ITEMS, pathname, {
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.permissions,
  });

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 md:px-8">
      <div
        className={cn(
          "flex h-14 w-full items-center justify-between gap-4 rounded-2xl border px-3 transition-all duration-300 sm:px-5",
          scrolled
            ? "border-ink-200/70 bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
            : "border-transparent bg-white/60 backdrop-blur-md",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <AdminMobileNav isSuperAdmin={user.isSuperAdmin} permissions={user.permissions} />
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink-900 md:text-xl">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <AdminGlobalSearch />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-ink-900">
                {user.fullName}
              </p>
              <p className="text-xs capitalize text-ink-500">
                {user.isSuperAdmin ? "SuperAdmin" : user.statusLabel}
              </p>
            </div>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white ring-2 ring-brand-400"
            >
              {initialsOf(user.fullName) || "?"}
            </span>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
