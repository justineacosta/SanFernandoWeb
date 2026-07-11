"use client";

import { Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/constants/site";
import { NavLink } from "@/components/navigation/nav-link";
import { useDisclosure } from "@/hooks/use-disclosure";

/** Hamburger toggle and slide-down panel for small screens. */
export function MobileNav() {
  const { isOpen, toggle, close } = useDisclosure();

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="p-2 text-primary"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {isOpen ? (
        <nav
          id="mobile-menu"
          aria-label="Primary"
          className="absolute inset-x-0 top-full border-b border-line bg-white shadow-(--shadow-ambient)"
        >
          <ul className="flex flex-col divide-y divide-line">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  onNavigate={close}
                  className="block px-6 py-4 text-sm font-semibold uppercase text-ink transition-colors hover:bg-surface-low hover:text-accent"
                  activeClassName="text-accent"
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
