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
        "flex h-screen w-64 flex-col border-r border-line bg-surface-low py-8",
        className,
      )}
    >
      <div className="mb-8 px-6">
        <div className="flex items-center gap-3">
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
          <div>
            <h2 className="text-lg font-bold leading-tight text-primary">Barangay Portal</h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              San Fernando
            </p>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-2 px-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              // Client boundary: pass only serializable fields (the icon is a component).
              item={{ label: item.label, href: item.href }}
              exact={item.exact}
              className="group flex items-center gap-4 rounded px-4 py-3 text-sm font-semibold text-ink-muted transition-all hover:bg-surface-highest [&>svg]:text-ink-muted [&>svg]:transition-colors hover:[&>svg]:text-primary"
              activeClassName="border-r-4 border-primary bg-accent-soft/40 font-bold text-primary [&>svg]:text-primary"
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto px-6">
        <Button variant="primary" className="w-full bg-danger hover:bg-danger-deep">
          <Siren className="h-5 w-5" aria-hidden="true" />
          Emergency Response
        </Button>
      </div>
    </aside>
  );
}
