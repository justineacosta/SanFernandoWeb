import Image from "next/image";
import { Bell, CircleHelp, Search } from "lucide-react";
import { ADMIN_USER } from "@/features/admin/data";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";

/** Flat sticky app bar for the admin portal: title, search, utilities, profile. */
export function AdminTopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-ink-200/70 bg-white px-4 md:px-8">
      <div className="flex items-center gap-2">
        <AdminMobileNav />
        <h1 className="text-lg font-semibold tracking-tight text-ink-900 md:text-xl">
          Civic Horizon Admin
        </h1>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative hidden sm:block">
          <Search
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <label htmlFor="admin-search" className="sr-only">
            Search
          </label>
          <input
            id="admin-search"
            type="search"
            placeholder="Search..."
            className="w-64 rounded-full border border-ink-200 bg-ink-50 py-2 pl-10 pr-4 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
          />
        </div>
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
          <Image
            src={ADMIN_USER.avatar}
            alt={`${ADMIN_USER.name} — ${ADMIN_USER.role}`}
            width={32}
            height={32}
            className="h-8 w-8 cursor-pointer rounded-full object-cover ring-2 ring-brand-400"
          />
        </div>
      </div>
    </header>
  );
}
