"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { POP, RISE } from "@/lib/motion";

interface SwapRevealProps {
  /** Key for the face currently shown — change it to animate the swap. */
  face: string;
  children: React.ReactNode;
}

/**
 * Crossfade-and-rise between the faces of a flow (form → success receipt).
 *
 * Each face renders its own <SwapReveal> at the same position in the tree, so
 * React reuses the AnimatePresence instance across the swap and only the keyed
 * child changes — which is exactly what makes the exit/enter pair run.
 * Opacity and a short rise only; nothing inside a face is individually staggered.
 */
export function SwapReveal({ face, children }: SwapRevealProps) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={face}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: POP }}
          transition={RISE}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
