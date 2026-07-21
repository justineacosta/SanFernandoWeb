import { Bell, CircleHelp, LogOut } from "lucide-react";
import type { SessionUser } from "@/types";
import { signOut } from "@/features/admin/actions/auth";
import { AdminGlobalSearch } from "@/features/admin/components/admin-global-search";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Flat sticky app bar for the admin portal: title, search, utilities, profile. */
export function AdminTopBar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-ink-200/70 bg-white px-4 md:px-8">
      <div className="flex items-center gap-2">
        <AdminMobileNav isSuperAdmin={user.isSuperAdmin} permissions={user.permissions} />
        <h1 className="text-lg font-semibold tracking-tight text-ink-900 md:text-xl">
          San Fernando Admin
        </h1>
      </div>
      <div className="flex items-center gap-6">
        <AdminGlobalSearch />
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Help"
            className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
          >
            <CircleHelp className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
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
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white ring-2 ring-brand-400"
          >
            {initialsOf(user.fullName) || "?"}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
