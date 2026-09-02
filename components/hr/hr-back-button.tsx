"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";

/**
 * The shared HR "Back" control — every HR surface must have one (Sir).
 *
 * It goes BACK through history (so it returns you to wherever you actually came
 * from — a stage hub, the front door, a search result), and falls back to a
 * sensible destination when there's no history to pop, e.g. the page was opened
 * in a fresh tab or reached by a direct link. Keyboard-first: it's a real button,
 * so Tab reaches it and Enter/Space activate it.
 */
export function HrBackButton({
  /** Where to go when there is no history to pop. */
  fallbackHref = "/hr",
  label = "Back",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        // `history.length > 1` means there IS something to pop. In a fresh tab it
        // is 1, so we route to the fallback instead of dead-ending on a no-op.
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallbackHref as Route);
      }}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
    >
      <ArrowLeft size={15} strokeWidth={2.4} /> {label}
    </button>
  );
}
