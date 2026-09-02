"use client";

import * as React from "react";
import { ClipboardCheck, Loader2, Plus, Sunrise } from "lucide-react";

const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

export interface PlanQuickDockProps {
  /** The day a commitment typed here lands on — the board's FIRST visible one. */
  dayLabel: string;
  /** Files a commitment on that day. Same path the column composer uses. */
  onAdd: (title: string) => void;
  /** `plan` still offers Start; anything later offers Review. */
  phase: "plan" | "active" | "closeout" | "closed";
  /** Today's lifecycle buttons are hidden while the window is parked on other
   *  days — starting and reviewing are both about TODAY. */
  isToday: boolean;
  /** The manager minimum is not met yet, so the day cannot start. */
  met: boolean;
  minItems: number;
  starting: boolean;
  onStart: () => void;
  onCloseout: () => void;
}

/**
 * THE FLOATING DAY ACTIONS — the two things you do most, always within reach.
 *
 * Both already exist elsewhere and are NOT re-implemented here: the input calls
 * the board's own `onAddCommitment` (the identical path the column composer
 * uses, so a commitment typed here is the same row filed the same way), and the
 * lifecycle button calls the board's own `onStartDay` / close-out handlers —
 * which is what keeps Start My Day's attendance automation intact, since the
 * `autoPunch("in")` lives in that handler rather than in any button.
 *
 * WHY IT FLOATS. The column composer sits at the top of a day; once a day has
 * a dozen rows on it, adding the thirteenth meant scrolling back up, and Start
 * My Day was off-screen entirely. Fixed to the viewport, both stay one click
 * away wherever you are in the list.
 *
 * IT IS NOT A SECOND COMPOSER. The column composer keeps the optional
 * start/end time fields — the precise version of the same act. This one is the
 * fast path: a title and Enter. Nothing was removed to make room for it.
 */
export function PlanQuickDock({
  dayLabel,
  onAdd,
  phase,
  isToday,
  met,
  minItems,
  starting,
  onStart,
  onCloseout,
}: PlanQuickDockProps) {
  const [draft, setDraft] = React.useState("");
  const valid = draft.trim().length >= 2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onAdd(draft.trim());
    setDraft("");
  }

  // Same rule as the header's own lifecycle button, so the two can never
  // disagree about which half of the day you are in.
  const lifecycle = !isToday ? null : phase === "plan" ? (
    <button
      type="button"
      onClick={onStart}
      disabled={!met || starting}
      title={met ? "Start my day" : `Plan at least ${minItems} items on Today to start`}
      className="brand-btn wg-btn inline-flex h-11 shrink-0 items-center gap-2 rounded-chip px-5 text-[14px] font-bold text-white disabled:opacity-40 disabled:shadow-none focus-visible:outline-2"
      style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
    >
      {starting ? <Loader2 size={16} className="animate-spin" /> : <Sunrise size={16} />}
      Start My Day
    </button>
  ) : (
    <button
      type="button"
      onClick={onCloseout}
      className="brand-btn wg-btn inline-flex h-11 shrink-0 items-center gap-2 rounded-chip px-5 text-[14px] font-bold text-white focus-visible:outline-2"
      style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
    >
      <ClipboardCheck size={16} /> Review My Day
    </button>
  );

  return (
    // `pointer-events-none` on the positioner, restored on the card itself —
    // the dock is pinned over a DRAG SURFACE, and a full-width invisible strip
    // would swallow drops aimed at the column beneath it.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end px-4 pb-4 max-sm:px-2 max-sm:pb-2">
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-[18px] border bg-surface-card p-2 shadow-[0_18px_45px_-12px_rgba(15,23,42,0.32)] backdrop-blur max-sm:w-full"
        style={{ borderColor: `color-mix(in srgb, ${GOALS_ACCENT_DEEP} 28%, var(--color-hairline))` }}
      >
        <form onSubmit={submit} className="flex min-w-0 items-center gap-2">
          <label className="relative flex min-w-0 items-center">
            <Plus
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 shrink-0"
              style={{ color: GOALS_ACCENT_DEEP }}
            />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add Commitment…"
              aria-label={`Add a commitment on ${dayLabel}`}
              maxLength={280}
              className="h-11 w-[260px] min-w-0 rounded-chip border border-hairline bg-surface-card pl-9 pr-3 text-[14px] text-ink-strong placeholder:text-ink-muted/70 hover:border-hairline-strong focus:border-altus-red focus-visible:outline-none max-sm:w-full max-lg:w-[200px]"
            />
          </label>
          <button
            type="submit"
            disabled={!valid}
            className="wg-btn inline-flex h-11 shrink-0 items-center gap-1.5 rounded-chip border px-4 text-[14px] font-bold transition-colors disabled:opacity-35 focus-visible:outline-2"
            style={{
              borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 32%, transparent)`,
              color: GOALS_ACCENT_DEEP,
              background: `color-mix(in srgb, ${GOALS_ACCENT} 8%, transparent)`,
              outlineColor: GOALS_ACCENT,
            }}
          >
            Add
          </button>
        </form>

        {lifecycle ? (
          <>
            <span
              aria-hidden
              className="h-7 w-px shrink-0"
              style={{ background: "var(--color-hairline)" }}
            />
            {lifecycle}
          </>
        ) : null}
      </div>
    </div>
  );
}
