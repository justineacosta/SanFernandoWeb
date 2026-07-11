import Image from "next/image";
import { Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITE } from "@/constants/site";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/navigation/nav-link";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

interface AdminSidebarProps {
  /** Extra classes on the aside — used to control overlay vs. fixed rendering. */
  className?: string;
}

/** Fixed left navigation rail for the admin portal. */
export function AdminSidebar({ className }: AdminSidebarProps) {
  return (
    <aside
      aria-label="Admin navigation"
      className={cn(
        "relative flex h-screen w-64 flex-col overflow-hidden border-r border-white/10 bg-ink-950 py-8 text-ink-300",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
      />
      <div className="relative mb-8 px-6">
        <div className="flex items-center gap-3">
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
          <div>
            <h2 className="text-lg font-semibold leading-tight tracking-tight text-white">
              Barangay Portal
            </h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              San Fernando
            </p>
          </div>
        </div>
      </div>
      <nav className="relative flex flex-1 flex-col gap-2 px-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              // Client boundary: pass only serializable fields (the icon is a component).
              item={{ label: item.label, href: item.href }}
              exact={item.exact}
              className="group flex items-center gap-4 rounded-full px-4 py-3 text-sm font-semibold text-ink-300 transition-all hover:bg-white/5 hover:text-white [&>svg]:text-ink-400 [&>svg]:transition-colors hover:[&>svg]:text-white"
              activeClassName="bg-white/10 text-white [&>svg]:text-brand-400"
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="relative mt-auto px-6">
        <Button variant="primary" className="w-full bg-danger hover:bg-danger-deep">
          <Siren className="h-5 w-5" aria-hidden="true" />
          Emergency Response
        </Button>
      </div>
    </aside>
  );
}
