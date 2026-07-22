"use client";

import { MotionConfig, motion } from "motion/react";
import { FADE_QUICK } from "@/lib/motion";

/**
 * Fades each admin page in on navigation. Opacity only — a transform here
 * would become the containing block for fixed-position overlays rendered
 * inside page content (the admin Drawer renders in place, not in a portal).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE_QUICK}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
