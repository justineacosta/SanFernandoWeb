"use client";

import { Menu, X } from "lucide-react";
import { useDisclosure } from "@/hooks/use-disclosure";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";

/** Hamburger + slide-in sidebar drawer for the admin portal on small screens. */
export function AdminMobileNav() {
  const { isOpen, toggle, close } = useDisclosure();

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close admin menu" : "Open admin menu"}
        className="p-2 text-ink-900"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={close}
            className="absolute inset-0 bg-ink-900/40"
          />
          <div className="absolute left-0 top-0" onClick={close}>
            <AdminSidebar className="shadow-xl" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
