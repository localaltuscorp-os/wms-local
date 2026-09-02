"use client";

import { motion } from "motion/react";

/**
 * Global route-entrance animation for the app. A template (not a layout)
 * re-mounts on every navigation, so each page fades in for a smooth, premium
 * feel. Intentionally OPACITY-ONLY — a transform here would create a
 * containing block and break the sticky header's `position: sticky`.
 *
 * MUST STAY A FLEX COLUMN THAT GROWS. This wrapper sits between ChromeShell's
 * full-height flex column and every page's `header → main` fragment. As a plain
 * block box it only grows to content height, which breaks the chain app-wide:
 * `.app-shell-column > main` (globals.css) then has no stretched parent to
 * absorb slack against, so a short page stops mid-viewport. `flex flex-1
 * flex-col` re-links it. No `min-h-0`: a column item's automatic min-height is
 * what lets long pages grow past the fold.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
