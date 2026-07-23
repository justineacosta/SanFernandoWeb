import type { Transition, Variants } from "motion/react";

/**
 * The only place springs, easings, and durations live. Components import
 * these; they never inline their own. Ceilings are enforced by
 * tests/unit/motion.test.ts.
 */

/** Matches --ease-out-soft in globals.css. */
export const EASE_OUT_SOFT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Panels and drawers: settles fast, no visible bounce. */
export const SPRING_PANEL: Transition = { type: "spring", stiffness: 380, damping: 40 };

/** Small shared-element indicators (the sidebar's active pill): a touch livelier. */
export const SPRING_INDICATOR: Transition = { type: "spring", stiffness: 420, damping: 34 };

/** Scrims and other pure fades. */
export const FADE_QUICK: Transition = { duration: 0.2 };

/** Menus and dialogs popping into place. */
export const POP: Transition = { duration: 0.15, ease: EASE_OUT_SOFT };

/** Entrances that rise into position (receipts, staggered list items). */
export const RISE: Transition = { duration: 0.3, ease: EASE_OUT_SOFT };

/** Pair with staggerContainer(): item side of a mount-time stagger. */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: RISE },
};

/** Parent side of a mount-time stagger over data (e.g. timeline steps). */
export const staggerContainer = (stagger = 0.08): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});
