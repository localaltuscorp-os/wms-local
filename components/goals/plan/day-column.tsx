"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "motion/react";
import { Clock, Plus } from "lucide-react";
import type { PlanDayColumn, PlanItem } from "./types";
import { PlanItemCard } from "./plan-item-card";
import { rangeFromHhmm } from "@/lib/goals/plan-time";

const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

/** Drop-target id for a day column — `day:<offset>`. */
export const DAY_DROP = "day:";
export const dayDropId = (offset: number) => `${DAY_DROP}${offset}`;

interface Props {
  day: PlanDayColumn;
  /** Highlight the column that is actually today. */
  isToday: boolean;
  busyId: string | null;
  onToggleDone: (item: PlanItem) => void;
  onPending: (item: PlanItem) => void;
  /** Copy a card onto the same day. */
  /** `ymd` = the day the copy should land on; omitted means this same day. */
  onDuplicate: (item: PlanItem, ymd?: string) => void;
  onRemove: (item: PlanItem) => void;
  onRename: (id: string, title: string) => void;
  onTransfer: (id: string, off: number) => void;
  /** Set (or clear) what time a commitment happens. */
  onSetTime: (item: PlanItem, time: { startMin: number | null; durationMin: number | null }) => void;
  /** A search is running — an empty column means "no match", not "nothing planned". */
  searching?: boolean;
  /** Type a DAILY COMMITMENT straight onto this day, optionally at a time. */
  onAddCommitment: (
    offset: number,
    title: string,
    time?: { startMin: number | null; durationMin: number | null },
  ) => void;
}

/**
 * One column of the daily kanban — a whole planner day.
 *
 * It is a drop target for BOTH families: a source card dropped here is filed
 * onto this day, and a card dragged from another column is re-dated onto it.
 * Either way the underlying `daily_checklist` row MOVES; nothing is copied, so
 * an item can never sit on two days at once (rule 11).
 */
export function DayColumn({
  day,
  isToday,
  busyId,
  onToggleDone,
  onPending,
  onDuplicate,
  onRemove,
  onRename,
  onTransfer,
  onSetTime,
  searching,
  onAddCommitment,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day.offset) });
  const [draft, setDraft] = React.useState("");
  // Optional time on the new commitment — blank means "Anytime".
  const [at, setAt] = React.useState("");
  const [until, setUntil] = React.useState("");
  // Live check so an impossible range is refused before it can be saved.
  const range = rangeFromHhmm(at, until);

  const ids = React.useMemo(() => day.items.map((i) => i.id), [day.items]);
  const open = day.items.filter((i) => !i.done).length;
  const doneCount = day.items.length - open;

  function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t.length < 2) return;
    if (!range.ok) return;
    const { startMin, durationMin } = range;
    onAddCommitment(day.offset, t, startMin == null && durationMin == null ? undefined : { startMin, durationMin });
    setDraft("");
    setAt("");
    setUntil("");
  }

  return (
    <section className="flex min-w-0 flex-col">
      <header className="mb-1.5 px-0.5">
        <h2 className="flex min-w-0 items-baseline gap-1.5">
          <span
            className="truncate text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 13.5,
              letterSpacing: "-0.01em",
              color: isToday ? GOALS_ACCENT_DEEP : undefined,
            }}
          >
            {day.word}
          </span>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-subtle">{day.date}</span>
        </h2>
      </header>

      {/* ADD A COMMITMENT — at the TOP of the column, above the count (Sir).
          This is the column's ONE composer; it used to sit at the bottom, below
          a long list, where you had to scroll to reach it. The time + length are
          optional: leave them blank and the commitment is "Anytime" work. */}
      <form onSubmit={submitDraft} className="mb-1.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            id={`plan-add-${day.offset}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a commitment…"
            aria-label={`Add a commitment on ${day.word} ${day.date}`}
            maxLength={280}
            className="h-7 min-w-0 flex-1 rounded-chip border border-hairline bg-surface-card px-2 text-[12px] text-ink-strong placeholder:text-ink-muted/60 focus-visible:outline-1"
            style={{ outlineColor: GOALS_ACCENT }}
          />
          <button
            type="submit"
            disabled={draft.trim().length < 2 || !range.ok}
            aria-label={`Add commitment on ${day.word}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-chip text-white disabled:opacity-35 focus-visible:outline-1"
            style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
          >
            <Plus size={13} />
          </button>
        </div>
        {draft.trim().length > 0 ? (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="shrink-0 text-ink-muted" aria-hidden />
            <input
              type="time"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              aria-label="Start time (optional)"
              className="h-7 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-card px-1.5 text-[11.5px] text-ink-soft focus-visible:outline-2"
              style={{ outlineColor: GOALS_ACCENT }}
            />
            <span className="shrink-0 text-[11px] text-ink-muted">to</span>
            <input
              type="time"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              aria-label="End time (optional)"
              className="h-7 min-w-0 flex-1 rounded-lg border bg-surface-card px-1.5 text-[11.5px] text-ink-soft focus-visible:outline-2"
              style={{
                outlineColor: GOALS_ACCENT,
                borderColor: range.error ? "var(--color-red-edge)" : "var(--color-hairline)",
              }}
            />
          </div>
        ) : null}
        {range.error ? (
          <p className="text-[11px] font-semibold" style={{ color: "var(--color-red-deep)" }}>
            {range.error}
          </p>
        ) : null}
      </form>

      {/* The count sits UNDER the day and the composer — across three columns a
          right-aligned number read as if it belonged to the next day along. */}
      <p className="mb-2 px-0.5 text-[10.5px] font-bold tabular-nums text-ink-muted">
        {doneCount > 0 ? `${doneCount} done · ` : ""}
        {open} to do
      </p>

      <div
        ref={setNodeRef}
        className="flex min-h-[220px] flex-1 flex-col rounded-2xl border p-2 transition-colors"
        style={{
          borderStyle: day.items.length === 0 && !isOver ? "dashed" : "solid",
          // EVERY column wears the red edge, not just today (Sir) — the day it
          // is still reads from the heading, which stays accented for today.
          borderColor: isOver
            ? GOALS_ACCENT
            : `color-mix(in srgb, ${GOALS_ACCENT_DEEP} 55%, transparent)`,
          // White, not the soft grey — the column reads by its border now that
          // the page behind it is white too.
          background: isOver ? `color-mix(in srgb, ${GOALS_ACCENT} 5%, transparent)` : "#ffffff",
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {day.items.map((item) => (
                <PlanItemCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onToggleDone={onToggleDone}
                  onPending={onPending}
                  onDuplicate={onDuplicate}
                  onRemove={onRemove}
                  onRename={onRename}
                  onTransfer={onTransfer}
                  onSetTime={onSetTime}
                  dayOffset={day.offset}
                  dayYmd={day.ymd}
                />
              ))}
            </AnimatePresence>
          </ul>
        </SortableContext>

        {day.items.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="my-auto px-3 py-6 text-center text-[12px] text-ink-muted/80"
          >
            {searching ? "No tasks found" : "Drop work here, or type a commitment above."}
          </motion.p>
        ) : null}
      </div>
    </section>
  );
}
