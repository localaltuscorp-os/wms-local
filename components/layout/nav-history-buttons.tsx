"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Back / Forward navigation buttons mounted at the leftmost end of the
 * rail's top control row, just before the search. Browser history doesn't
 * expose a reliable "can go back/forward" signal across browsers, so we don't
 * try to gray-out — buttons always feel clickable; if there's nothing
 * to navigate to, router.back/forward simply no-ops.
 *
 * Chrome deliberately matches the two icon buttons sitting beside them in the
 * same row (GlobalSearch's trigger + SidebarToggle): rounded square, hairline
 * border, soft surface — one visual family, not a red-tinted pill pair.
 */
const BTN =
  "inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline " +
  "bg-surface-soft text-ink-subtle transition-colors hover:bg-surface-card " +
  "hover:border-hairline-strong hover:text-ink-strong";

export function NavHistoryButtons() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 max-xl:hidden shrink-0">
      <button
        type="button"
        aria-label="Back"
        title="Back"
        onClick={() => router.back()}
        className={BTN}
      >
        <ChevronLeft size={18} strokeWidth={2.3} />
      </button>
      <button
        type="button"
        aria-label="Forward"
        title="Forward"
        onClick={() => router.forward()}
        className={BTN}
      >
        <ChevronRight size={18} strokeWidth={2.3} />
      </button>
      <span
        aria-hidden
        className="ml-2 mr-1 inline-block"
        style={{
          width: 1,
          height: 24,
          background: "var(--color-hairline)",
        }}
      />
    </div>
  );
}
