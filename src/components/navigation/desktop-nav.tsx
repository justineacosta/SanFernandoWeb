import { NAV_ITEMS } from "@/constants/site";
import { NavLink } from "@/components/navigation/nav-link";

/** Horizontal primary navigation shown on large screens. */
export function DesktopNav() {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          className="text-sm font-semibold uppercase text-ink transition-colors hover:text-accent"
          activeClassName="border-b-2 border-accent pb-1 text-accent"
        />
      ))}
    </nav>
  );
}
