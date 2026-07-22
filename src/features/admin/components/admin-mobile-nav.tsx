"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import type { Permission } from "@/types";
import { FADE_QUICK, SPRING_PANEL } from "@/lib/motion";
import { useDisclosure } from "@/hooks/use-disclosure";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";

/** Hamburger + slide-in sidebar drawer for the admin portal on small screens. */
export function AdminMobileNav({
  isSuperAdmin,
  permissions,
}: {
  isSuperAdmin: boolean;
  permissions: Permission[];
}) {
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
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpen ? (
            <motion.div key="admin-drawer" className="fixed inset-0 z-50">
              <motion.button
                type="button"
                aria-label="Close admin menu"
                onClick={close}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_QUICK}
                className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
              />
              <motion.div
                // −288 clears the 256px rail plus its shadow before unmount.
                initial={{ x: -288 }}
                animate={{ x: 0 }}
                exit={{ x: -288 }}
                transition={SPRING_PANEL}
                className="absolute left-0 top-0"
                onClick={close}
              >
                <AdminSidebar
                  className="shadow-floating"
                  isSuperAdmin={isSuperAdmin}
                  permissions={permissions}
                  collapsed={false}
                />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
