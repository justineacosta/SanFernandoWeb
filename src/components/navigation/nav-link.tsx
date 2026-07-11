"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types";

interface NavLinkProps {
  item: NavItem;
  className?: string;
  activeClassName?: string;
  /** Match the route exactly instead of by prefix (for index routes like "/admin"). */
  exact?: boolean;
  onNavigate?: () => void;
  /** Custom link content (e.g. icon + label); defaults to the item label. */
  children?: React.ReactNode;
}

/** Navigation link that highlights itself on the active route. */
export function NavLink({
  item,
  className,
  activeClassName,
  exact,
  onNavigate,
  children,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    exact || item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(className, isActive && activeClassName)}
    >
      {children ?? item.label}
    </Link>
  );
}
