"use client";

import { motion } from "motion/react";

/**
 * Global route-entrance animation for the app. A template (not a layout)
 * re-mounts on every navigation, so each page fades in for a smooth, premium
 * feel. Intentionally OPACITY-ONLY — a transform here would create a
 * containing block and break the sticky header's `position: sticky`.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
