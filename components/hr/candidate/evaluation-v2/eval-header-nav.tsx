"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Browser-style Back / Forward controls for the Evaluation top bar — quick
 * history navigation without leaving the keyboard (both are focusable buttons).
 * Kept as its own client leaf so the page shell stays a server component.
 */
export function EvalHeaderNav() {
  const router = useRouter();
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        title="Back"
        className="grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-white text-ink-strong transition-colors hover:border-ink-muted"
      >
        <ChevronLeft size={17} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        onClick={() => router.forward()}
        aria-label="Go forward"
        title="Forward"
        className="grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-white text-ink-strong transition-colors hover:border-ink-muted"
      >
        <ChevronRight size={17} strokeWidth={2.6} />
      </button>
    </div>
  );
}
