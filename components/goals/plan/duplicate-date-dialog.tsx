"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { PlanItem } from "./types";

const GOALS_ACCENT = "#E10600";

/**
 * "Duplicate to <date>" — the one dialog both places that copy a commitment
 * use: the planner card and the end-of-day review row.
 *
 * It was only on the card. The review row's copy button fired straight away
 * onto the SAME day, so the two buttons wearing the same icon did two different
 * things depending on which screen you were looking at, and the review row gave
 * you no way to say when.
 *
 * A PORTAL, not a popover anchored to the button. Both call sites sit inside
 * collapsing `grid-rows-[0fr]` boxes with `overflow-hidden`, nested in a
 * scrolling column — an absolutely-positioned panel there is clipped by the
 * collapse wrapper and again by the column, so it would simply never be
 * visible. The detail dialog already solved this the same way.
 */
export function DuplicateDateDialog({
  item,
  defaultYmd,
  onCancel,
  onConfirm,
}: {
  item: PlanItem;
  /** The day the picker opens on — normally the day the row is sitting in. */
  defaultYmd: string;
  onCancel: () => void;
  onConfirm: (ymd: string) => void;
}) {
  // A DRAFT date: nothing is copied until Duplicate (or Enter) is pressed, so
  // closing the dialog leaves the board exactly as it was.
  const [ymd, setYmd] = React.useState(defaultYmd);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Duplicate this commitment"
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] max-w-[92vw] rounded-2xl border border-hairline-strong bg-surface-card p-4 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Duplicate to
        </p>
        <p className="mt-1 truncate text-[13.5px] font-bold text-ink-strong" title={item.title}>
          {item.title}
        </p>
        <input
          type="date"
          value={ymd}
          autoFocus
          onChange={(e) => setYmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && ymd) onConfirm(ymd);
          }}
          aria-label="Day to copy this onto"
          className="mt-3 w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] font-semibold text-ink-strong outline-none focus:border-hairline-strong"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ymd}
            onClick={() => onConfirm(ymd)}
            className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition-opacity disabled:opacity-40"
            style={{ background: GOALS_ACCENT }}
          >
            Duplicate
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
