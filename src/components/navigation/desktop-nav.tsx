import { NAV_ITEMS } from "@/constants/site";
import { NavLink } from "@/components/navigation/nav-link";

/** Pill-style primary navigation shown on large screens. */
export function DesktopNav() {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          activeClassName="bg-ink-900/[0.06] text-ink-900"
        />
      ))}
    </nav>
  );
}
