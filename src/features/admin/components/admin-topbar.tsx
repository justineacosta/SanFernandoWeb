"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { POP } from "@/lib/motion";
import { adminPageTitle } from "@/lib/admin-nav";
import { Avatar } from "@/components/ui/avatar";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { AdminGlobalSearch } from "@/features/admin/components/admin-global-search";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";
import { SignOutButton } from "@/features/admin/components/sign-out-button";

/**
 * Floating app bar for the admin portal: current page, search, profile.
 *
 * Styled after the public site's header (`SiteHeader`) — a rounded, blurred
 * bar. It keeps a hairline border even at rest so it reads as an object over
 * the white page, and takes its shadow only once there is content behind it.
 * The title crossfades when the route changes module.
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
    <MotionConfig reducedMotion="user">
      <header className="sticky top-0 z-40 mx-auto w-full max-w-(--container-page) px-4 pt-4 md:px-8">
        <div
          className={cn(
            "flex h-14 w-full items-center justify-between gap-4 rounded-2xl border px-3 backdrop-blur-md transition-all duration-300 sm:px-5",
            scrolled
              ? "border-ink-200/80 bg-white/85 shadow-raised"
              : "border-ink-200/60 bg-white/70",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AdminMobileNav isSuperAdmin={user.isSuperAdmin} permissions={user.permissions} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1
                key={title}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={POP}
                className="truncate text-lg font-semibold tracking-tight text-ink-900 md:text-xl"
              >
                {title}
              </motion.h1>
            </AnimatePresence>
          </div>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <AdminGlobalSearch />
            <span aria-hidden="true" className="hidden h-6 w-px bg-ink-200 sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-tight text-ink-900">
                  {user.fullName}
                </p>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-brand-700">
                  {user.isSuperAdmin ? "SuperAdmin" : user.statusLabel}
                </p>
              </div>
              <Avatar src={user.avatarSrc} fullName={user.fullName} size="sm" />
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>
    </MotionConfig>
  );
}
