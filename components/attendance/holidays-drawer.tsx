"use client";

import * as React from "react";
import { CalendarHeart, X } from "lucide-react";
import { UpcomingHolidaysPanel, type UpcomingHoliday } from "./upcoming-holidays-panel";

/**
 * UPCOMING HOLIDAYS, as a right-edge drawer.
 *
 * ── WHY A DRAWER AND NOT A COLUMN ──────────────────────────────────────────
 * The holiday list is reference material: checked occasionally, then ignored
 * for weeks. It was holding a third of the attendance page's width permanently
 * so that the punch clock and the month calendar — the two things people
 * actually come here for — were squeezed into the rest. Collapsed to a tab, it
 * costs nothing until it is wanted, and the calendar takes the width back.
 *
 * ── THE TAB IS THE AFFORDANCE ──────────────────────────────────────────────
 * A drawer nobody can find is a drawer that does not exist. The tab is pinned
 * to the right edge, vertically centred, and carries a label as well as an
 * icon — a bare icon on a page edge reads as decoration. It also shows the
 * count, so the page says how many holidays are coming without being opened.
 *
 * Escape closes it, focus moves to the panel on open and back to the tab on
 * close, and the backdrop is click-through-to-close. Body scroll is locked
 * while it is open so the page behind does not drift under the panel.
 */
export function HolidaysDrawer({ holidays }: { holidays: UpcomingHoliday[] }) {
  const [open, setOpen] = React.useState(false);
  const tabRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Escape to close, and keep the page behind from scrolling under the panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Returning focus to the tab matters for keyboard users: without it, closing
  // the drawer drops focus to the top of the document.
  const close = React.useCallback(() => {
    setOpen(false);
    tabRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="holidays-drawer"
        title="Upcoming holidays"
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-2xl border border-r-0 border-hairline bg-surface-card py-4 pl-3 pr-2.5 text-ink-soft shadow-[0_8px_30px_-18px_rgba(15,23,42,0.45)] transition-colors hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40"
      >
        <span className="flex flex-col items-center gap-2">
          <CalendarHeart size={18} strokeWidth={2.4} />
          {holidays.length > 0 && (
            <span className="text-[11px] font-black tabular-nums text-ink-strong">
              {holidays.length}
            </span>
          )}
          {/* Vertical, so the tab stays narrow while still saying what it is. */}
          <span
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
            style={{ writingMode: "vertical-rl" }}
          >
            Holidays
          </span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/25"
          onClick={close}
          aria-hidden
        />
      )}

      <div
        id="holidays-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Upcoming holidays"
        tabIndex={-1}
        // Always mounted, translated off-screen when shut: the list keeps its
        // scroll position between openings, and the slide has something to
        // animate from. `invisible` keeps it out of the tab order when closed.
        className={
          "fixed right-0 top-0 z-50 h-full w-[min(380px,92vw)] overflow-y-auto border-l border-hairline bg-surface-page p-4 outline-none transition-transform duration-200 ease-out " +
          (open ? "translate-x-0" : "invisible translate-x-full")
        }
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={close}
            aria-label="Close upcoming holidays"
            className="inline-grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        <UpcomingHolidaysPanel holidays={holidays} />
      </div>
    </>
  );
}
