"use client";

import { useCallback, useState } from "react";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopBar } from "./admin-topbar";

const COOKIE = "sf-admin-sidebar";

interface AdminShellProps {
  user: SessionUser;
  /** Read server-side from the cookie, so a collapsed rail renders collapsed on first paint. */
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

/**
 * Owns the sidebar's collapsed state for both the rail and the main column's
 * left margin — the two must move together or the layout tears.
 *
 * The initial value comes from the server via a cookie rather than from
 * localStorage in an effect: an effect runs after paint, so a collapsed
 * sidebar would render expanded and snap shut on every load.
 */
export function AdminShell({ user, defaultCollapsed, children }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      document.cookie = `${COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        className="fixed left-0 top-0 z-30 hidden md:flex"
        isSuperAdmin={user.isSuperAdmin}
        permissions={user.permissions}
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div
        className={cn(
          "flex min-h-screen w-full flex-1 flex-col transition-[margin] duration-200",
          collapsed ? "md:ml-18" : "md:ml-64",
        )}
      >
        <AdminTopBar user={user} />
        <main className="mx-auto w-full max-w-(--container-page) flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
