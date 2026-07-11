import Image from "next/image";
import { Bell, CircleHelp, Search } from "lucide-react";
import { ADMIN_USER } from "@/features/admin/data";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";

/** Flat sticky app bar for the admin portal: title, search, utilities, profile. */
export function AdminTopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-line bg-surface px-4 md:px-8">
      <div className="flex items-center gap-2">
        <AdminMobileNav />
        <h1 className="text-lg font-bold text-primary md:text-xl">Civic Horizon Admin</h1>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative hidden sm:block">
          <Search
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline"
            aria-hidden="true"
          />
          <label htmlFor="admin-search" className="sr-only">
            Search
          </label>
          <input
            id="admin-search"
            type="search"
            placeholder="Search..."
            className="w-64 rounded-full border border-line bg-surface-low py-2 pl-10 pr-4 text-ink transition-colors focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-low"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Help"
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-low"
          >
            <CircleHelp className="h-5 w-5" aria-hidden="true" />
          </button>
          <Image
            src={ADMIN_USER.avatar}
            alt={`${ADMIN_USER.name} — ${ADMIN_USER.role}`}
            width={32}
            height={32}
            className="h-8 w-8 cursor-pointer rounded-full border border-line object-cover"
          />
        </div>
      </div>
    </header>
  );
}
