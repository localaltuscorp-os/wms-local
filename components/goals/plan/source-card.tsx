"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { PRIORITY_LABELS } from "@/db/enums";
import type { SourceItem } from "./types";
import { SourceTag, fmtYmd } from "./source-tag";
import { overdueLabel } from "./wms-filters";
import { ItemDetailModal, ItemHoverCard } from "./item-detail";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** dnd id for a source card — namespaced so it never collides with plan row ids. */
export function sourceDragId(item: SourceItem): string {
  return `src::${item.kind}::${item.id}`;
}

const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

/**
 * `ymd` plus `n` days, still as YYYY-MM-DD.
 *
 * Parsed into a UTC instant rather than a local Date: `new Date("2026-08-31")`
 * is midnight UTC, and reading it back with local getters in IST returns the
 * 31st, but in any timezone west of Greenwich it returns the 30th. Doing the
 * arithmetic in UTC on both ends keeps the label matching the day the server
 * will file it on, whose own `ymdForOffset` works exactly this way.
 */
function plusDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** The three days a plan is actually made for. Offsets are days from TODAY,
 *  which is what the server's `ymdForOffset` expects — deliberately not the
 *  visible window's first column, which is a different day the moment the
 *  strip is paged forward. */
const QUICK_DAYS = [
  { offset: 0, label: "Today" },
  { offset: 1, label: "Tomorrow" },
  { offset: 2, label: "Day after" },
] as const;

interface Props {
  item: SourceItem;
  /** Today's date (YYYY-MM-DD) — what the overdue counts compare against. */
  today: string;
  /** No-drag quick path — add straight to the first day of the visible window. */
  onAdd: (item: SourceItem) => void;
  /**
   * File onto an EXPLICIT day, `offset` days from today.
   *
   * When present the `+` opens a Today / Tomorrow / Day after chooser instead
   * of filing blind. The plain `+` files onto the first column of the visible
   * WINDOW, which is only "today" until someone pages the strip forward — after
   * that the button quietly means a different day than it says. Naming the three
   * days removes the guess. Dragging still handles every other date.
   */
  onAddOn?: (item: SourceItem, offset: number) => void;
  /** Abandon the underlying task → Recycle Bin (only for task-linked cards). */
  onAbandon?: (item: SourceItem) => void;
  /** "Today" | "18 Aug" — where the `+` button files it. */
  addDayLabel?: string;
}

/**
 * A draggable card in one of the source panels — drag it onto any day column,
 * or press `+` to file it on the first visible day.
 *
 * WHAT IT SHOWS (Sir's rule 3): the task itself, up to three lines, plus only
 * the two facts you act on — how late it is and how important it is. The task
 * id, the company, and the internal WMS stage are gone; they told you nothing
 * about what to do and crowded out the text that did. Anything longer than
 * three lines is one hover away, never permanently truncated.
 *
 * A card is a REFERENCE, never a copy: `item.id` is the real `tasks.id` /
 * `weekly_goals.id` / `goals.id` / prior `daily_checklist.id`, and adding it
 * calls the matching server action, which stores that id on the plan row.
 */
export function SourceCard({ item, today, onAdd, onAddOn, onAbandon, addDayLabel = "Today" }: Props) {
  const [detail, setDetail] = React.useState(false);
  const [pickDay, setPickDay] = React.useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sourceDragId(item),
    data: { type: "source", kind: item.kind, sourceId: item.id, title: item.title, subtitle: item.subtitle },
    disabled: item.added,
  });

  const isTask = item.kind === "task";
  const isCarryover = item.kind === "unfinished";
  const late = overdueLabel(item.dueYmd, today);
  const dueToday = isTask && item.dueYmd === today;
  // "Priority where relevant" — Normal is the default every task carries, so
  // printing it on every row is noise. Only a raised priority earns the line.
  const showPriority = item.priority != null && item.priority !== "not_imp_not_urgent";

  return (
    <ItemHoverCard item={item} today={today}>
      <motion.div
        ref={setNodeRef}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: item.added ? 0.5 : 1, y: 0 }}
        style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined }}
        className="group relative rounded-xl border border-hairline bg-surface-card px-2.5 py-2 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] hover:border-hairline-strong hover:shadow-[0_6px_18px_rgba(124,45,18,0.08)]"
      >
        {/* The one action: file it onto a day. Once added the card reads
            "PLANNED" — deliberately NOT a green tick, which is what made
            planning look like completing (bug 10). */}
        {item.added ? (
          <span
            className="absolute right-1.5 top-1.5 z-10 rounded-[4px] border border-hairline bg-surface-soft px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.06em] text-ink-muted"
            title="Already on a planner day"
          >
            Planned
          </span>
        ) : onAddOn ? (
          <Popover open={pickDay} onOpenChange={setPickDay}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Add to a day"
                aria-label={`Add ${item.title} to a day`}
                className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full text-white shadow-sm transition-transform hover:scale-110 focus-visible:outline-2"
                style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
              >
                <Plus size={14} strokeWidth={3.2} />
              </button>
            </PopoverTrigger>
            {/* Radix, like every other popover in this app: the rail is an
                `overflow-y-auto` column, so an in-flow menu would be clipped by
                the very first card and unreachable from the last. */}
            <PopoverContent align="end" sideOffset={6} className="w-[168px] p-1">
              {QUICK_DAYS.map((q) => (
                <button
                  key={q.offset}
                  type="button"
                  onClick={() => {
                    setPickDay(false);
                    onAddOn(item, q.offset);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft focus-visible:outline-2"
                  style={{ outlineColor: GOALS_ACCENT }}
                >
                  {q.label}
                  {/* The date under the word. "Day after" is unambiguous only
                      if you can see which date it lands on. */}
                  <span className="text-[11px] font-semibold text-ink-muted">
                    {fmtYmd(plusDays(today, q.offset))}
                  </span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(item)}
            title={`Add to ${addDayLabel}`}
            aria-label={`Add ${item.title} to ${addDayLabel}`}
            className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full text-white shadow-sm transition-transform hover:scale-110 focus-visible:outline-2"
            style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
          >
            <Plus size={14} strokeWidth={3.2} />
          </button>
        )}

        <div className="flex items-start gap-1.5 pr-8">
          <button
            type="button"
            aria-label={item.added ? "Already planned" : `Drag ${item.title} onto a day`}
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-ink-muted/40 hover:text-ink-muted focus-visible:outline-2 disabled:cursor-default disabled:opacity-25"
            style={{ outlineColor: GOALS_ACCENT }}
            disabled={item.added}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>

          {/* SINGLE click → the whole thing, top to bottom (Sir). Hover stays a
              glance; this is the full read. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setDetail(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDetail(true);
              }
            }}
            aria-label={`Open full details for ${item.title}`}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            {/* THE TASK ITSELF — three lines minimum before anything is hidden,
                and what's hidden is on the hover panel, never lost. */}
            <div
              className="text-[13px] font-semibold leading-[17px] text-ink-strong"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                overflowWrap: "anywhere",
              }}
            >
              {item.title}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-[15px] text-ink-muted">
              <SourceTag kind={isCarryover ? (item.originKind ?? "unfinished") : item.kind} />
              {/* HOW LATE — a plain count, not a red OVERDUE badge: the bucket
                  filter above the list already says these are overdue. */}
              {late ? (
                <span className="font-semibold tabular-nums" style={{ color: RISK }}>
                  {late}
                </span>
              ) : dueToday ? (
                <span className="font-semibold" style={{ color: WARN }}>
                  Due today
                </span>
              ) : item.dueYmd ? (
                <span className="tabular-nums">Due {fmtYmd(item.dueYmd)}</span>
              ) : null}
              {showPriority ? (
                <span
                  className="font-semibold"
                  style={item.priority === "imp_urgent" ? { color: RISK } : { color: WARN }}
                >
                  {PRIORITY_LABELS[item.priority!]}
                </span>
              ) : null}
              {item.timeLabel ? <span className="tabular-nums">{item.timeLabel}</span> : null}
              {isCarryover && item.fromYmd ? (
                <span className="tabular-nums">from {fmtYmd(item.fromYmd)}</span>
              ) : null}
              {!isTask && !isCarryover && item.meta ? (
                <span className="tabular-nums">{item.meta}</span>
              ) : null}
            </div>
          </div>

          {onAbandon && item.taskId ? (
            <button
              type="button"
              onClick={() => onAbandon(item)}
              aria-label={`Abandon ${item.title} (moves to Recycle Bin)`}
              title="Abandon - moves to Recycle Bin"
              className="absolute bottom-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-full text-ink-muted/60 opacity-0 transition-opacity hover:bg-surface-soft hover:text-[color:var(--color-altus-red)] focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
              style={{ outlineColor: GOALS_ACCENT }}
            >
              <Trash2 size={13} />
            </button>
          ) : null}
        </div>
      </motion.div>
      {detail ? (
        <ItemDetailModal
          item={item}
          today={today}
          onClose={() => setDetail(false)}
          onAdd={() => onAdd(item)}
          addLabel={`Add to ${addDayLabel}`}
        />
      ) : null}
    </ItemHoverCard>
  );
}
