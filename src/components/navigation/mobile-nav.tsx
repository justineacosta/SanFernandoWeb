"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { FADE_QUICK, POP } from "@/lib/motion";
import { NAV_ITEMS } from "@/constants/site";
import { NavLink } from "@/components/navigation/nav-link";
import { useDisclosure } from "@/hooks/use-disclosure";

/** Round glassy burger toggle and floating card menu for small screens. */
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
        className="inline-flex size-10 items-center justify-center rounded-full border border-ink-200/80 bg-white/80 text-ink-900 backdrop-blur"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpen ? (
            <motion.nav
              key="mobile-menu"
              id="mobile-menu"
              aria-label="Primary"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, transition: FADE_QUICK }}
              transition={POP}
              style={{ transformOrigin: "top center" }}
              className="fixed inset-x-4 top-20 rounded-3xl border border-ink-200/70 bg-white/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl"
            >
              <ul className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      onNavigate={close}
                      className="block rounded-full px-4 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
                      activeClassName="bg-ink-900/[0.06] text-ink-900"
                    />
                  </li>
                ))}
              </ul>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
