"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Glass-morphic card with a delicate gradient accent strip running down its
 * left edge. Fades + slides up on mount, then lets its children stagger in.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1], delay: 0.1 }}
      className="auth-card relative p-8 max-md:p-6"
    >
      {/* Left-edge gradient accent strip */}
      <div
        aria-hidden
        className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r"
        style={{
          background:
            "linear-gradient(180deg, var(--color-altus-red), var(--color-rose), var(--color-purple), var(--color-blue), var(--color-green))",
          opacity: 0.85,
        }}
      />
      {/* Top-corner soft highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[24px]"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255, 255, 255, 0.6), transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}
