"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Copy, GripVertical, Loader2, Pencil, X } from "lucide-react";
import { motion } from "motion/react";
import { PRIORITY_LABELS } from "@/db/enums";
import { hhmmToMin, minToHhmm } from "@/lib/goals/plan-time";
import type { PlanItem } from "./types";
import { DuplicateDateDialog } from "./duplicate-date-dialog";
import { SourceTag, fmtYmd } from "./source-tag";
import { PlanItemDetailModal, PlanItemHoverCard } from "./item-detail";
import { HoverTip } from "@/components/ui/hover-tip";

const GOALS_ACCENT = "#E10600";
const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

interface Props {
  item: PlanItem;
  /** Marking done / pending is disabled while this row's write is in flight. */
  busy?: boolean;
  /** Explicit completion — the ONLY thing that completes a task (rule 10). */
  onToggleDone: (item: PlanItem) => void;
  /** Park it: stays on this day, surfaces under Unfinished (rule 5/6). */
  onPending: (item: PlanItem) => void;
  /** Copy the row onto `ymd`. The card's picker always supplies one. */
  onDuplicate: (item: PlanItem, ymd?: string) => void;
  /** The × — off the plan, and into the Recycle Bin when a task backs it. */
  onRemove: (item: PlanItem) => void;
  /** Save an edited title (fix a typo). Absent ⇒ the card is read-only text. */
  onRename?: (id: string, title: string) => void;
  /** Re-date this commitment onto planner day `off`. */
  onTransfer: (id: string, off: number) => void;
  /** Set (or clear) WHEN in the day this work happens. */
  onSetTime: (item: PlanItem, time: { startMin: number | null; durationMin: number | null }) => void;
  /** Which planner day this card sits on — its own day is dropped from the
   *  move menu, and the two shortcut buttons target the next two days. */
  dayOffset: number;
  /** This day as `YYYY-MM-DD` — what the duplicate picker opens on. */
  dayYmd: string;
}

/**
 * One commitment in a day column of the kanban.
 *
 * Sir's rule 10 — PLANNING IS NOT COMPLETING. There is no bare tick sitting in
 * the drag path any more: completion is the labelled "Done" button in the
 * action row, and the row only appears on hover/focus so the card at rest is
 * just the work. Dragging, dropping and re-ordering never touch `done`.
 *
 * The four review actions Sir asked for are all one click, right here:
 * Done · → next day · → the day after that · Pending.
 *
 * DELIBERATELY NO DATE-PICKER (Sir): a fifth control opening a menu of every
 * planner day was clutter on a card this size. Any further day is still one
 * gesture away — drag the card onto that day's tab in the strip above.
 */
export function PlanItemCard({
  item,
  busy,
  onToggleDone,
  onPending,
  onDuplicate,
  onRemove,
  onRename,
  onTransfer,
  onSetTime,
  dayOffset,
  dayYmd,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "plan" },
  });

  // Single click opens the full view; renaming happens in there (a card can't
  // have single-click-to-open AND double-click-to-rename on the same text).
  const [detail, setDetail] = React.useState(false);

  // The duplicate picker. `copyTo` is a draft date and nothing happens until
  // Copy is pressed, so opening it and changing your mind costs nothing —
  // duplicating used to fire on the first click with no way back.
  const [copyOpen, setCopyOpen] = React.useState(false);

  // The live drag placeholder — a dashed ghost the column opens up around.
  if (item.ghost) {
    return (
      <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="list-none">
        <div
          className="flex items-center gap-2 rounded-chip border px-3 py-3"
          style={{
            borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 55%, transparent)`,
            background: `color-mix(in srgb, ${GOALS_ACCENT} 6%, transparent)`,
          }}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-strong/70">{item.title}</span>
          <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: GOALS_ACCENT }}>
            Drop
          </span>
        </div>
      </li>
    );
  }

  const showPriority = item.priority != null && item.priority !== "not_imp_not_urgent";
  const late = item.overdueDays != null && item.overdueDays > 0 ? item.overdueDays : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className="list-none"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="group @container min-w-0 rounded-chip border bg-surface-card px-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
        style={{
          borderColor: item.done
            ? "color-mix(in srgb, var(--color-green) 38%, transparent)"
            : item.pending
              ? "color-mix(in srgb, var(--color-amber) 45%, transparent)"
              : "var(--color-hairline)",
          background: item.done ? "color-mix(in srgb, var(--color-green) 5%, #fff)" : undefined,
          ...(isDragging ? { boxShadow: "0 10px 30px rgba(15,23,42,0.16)" } : {}),
        }}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Move or reorder ${item.title}`}
            className="shrink-0 cursor-grab touch-none rounded text-ink-muted/40 hover:text-ink-muted focus-visible:outline-2"
            style={{ outlineColor: GOALS_ACCENT }}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>

          <div className="min-w-0 flex-1">
              {/* The hover panel hangs off the TASK TEXT alone — wrapping the
                  whole card fired it over the action row and the time fields. */}
              <PlanItemHoverCard item={item} disabled={isDragging}>
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
                aria-label={onRename && !item.done ? `Open and edit ${item.title}` : `Open full details for ${item.title}`}
                /* ONE LINE (Sir). The clamp used to run to three, which set the
                   card's height by its longest title and left every short one
                   sitting in empty space — the single biggest reason so few
                   rows fitted on screen. Nothing is lost: the full text is one
                   hover away in the panel this sits inside, and one click away
                   in the detail dialog. */
                className={
                  "truncate text-[13px] leading-[17px] " +
                  (onRename && !item.done ? "cursor-pointer " : "") +
                  (item.done ? "font-medium text-ink-muted line-through" : "font-semibold text-ink-strong")
                }
              >
                {item.title}
              </div>
              </PlanItemHoverCard>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] leading-[13px] text-ink-muted">
              <SourceTag kind={item.kind} />

              {/* WHEN this gets done, and HOW LONG it will take (Sir).
                  On the card the length is a DROPDOWN, not a second clock: it
                  reads as "45 min" — how long the task takes — which is the
                  thing you actually decide when planning. The end time is
                  derived from it and shown on the review row as "End 7:05 PM",
                  and the detail dialog still offers an explicit end time for
                  when you want to set the finish rather than the duration.
                  Blank start = "Anytime". */}
              {!item.done ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={10} className="shrink-0" aria-hidden />
                  <input
                    type="time"
                    value={item.startMin != null ? minToHhmm(item.startMin) : ""}
                    onChange={(e) => {
                      const startMin = hhmmToMin(e.target.value);
                      onSetTime(item, {
                        startMin,
                        // Clearing the start clears the block; setting one keeps
                        // the length you already chose, else a sensible 30 min.
                        durationMin: startMin == null ? null : (item.durationMin ?? 30),
                      });
                    }}
                    aria-label={`What time to start ${item.title}`}
                    className="w-[74px] rounded border border-transparent bg-transparent px-0.5 py-0 text-[10.5px] font-semibold tabular-nums text-ink-soft hover:border-hairline focus:border-hairline-strong focus:outline-none"
                  />
                  {item.startMin != null ? (
                    <select
                      value={item.durationMin != null ? String(item.durationMin) : ""}
                      onChange={(e) =>
                        onSetTime(item, {
                          startMin: item.startMin ?? null,
                          // "—" clears it: a start time with no length.
                          durationMin: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      aria-label={`How long ${item.title} will take`}
                      className="rounded border border-transparent bg-transparent py-0 text-[10.5px] font-semibold text-ink-soft hover:border-hairline focus:border-hairline-strong focus:outline-none"
                    >
                      <option value="">-</option>
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 hr</option>
                      <option value="90">1.5 hrs</option>
                      <option value="120">2 hrs</option>
                      <option value="180">3 hrs</option>
                    </select>
                  ) : null}
                </span>
              ) : item.timeLabel ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock size={10} /> {item.timeLabel}
                </span>
              ) : null}
              {late ? (
                <span className="font-semibold tabular-nums" style={{ color: RISK }}>
                  {late} day{late === 1 ? "" : "s"} overdue
                </span>
              ) : null}
              {showPriority ? (
                <span
                  className="font-semibold"
                  style={item.priority === "imp_urgent" ? { color: RISK } : { color: WARN }}
                >
                  {PRIORITY_LABELS[item.priority!]}
                </span>
              ) : null}
              {item.pending ? (
                <span className="font-bold uppercase tracking-[0.06em]" style={{ color: WARN }}>
                  Pending
                </span>
              ) : null}
              {/* The day ended and nobody said what happened, so the system moved
                  it here. One quiet chip — the same weight as the source tag. */}
              {item.carriedForward ? (
                <span className="font-bold uppercase tracking-[0.06em]" style={{ color: WARN }}>
                  Carried forward{item.fromYmd ? ` · from ${fmtYmd(item.fromYmd)}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          {/* EDIT — the card could already be edited: clicking the title opens
              the detail dialog, whose title field is a textarea with a Save.
              Nothing SAID so. The only hint was a `cursor-pointer` that appears
              on hover, next to a remove button that also appears on hover, so
              the one discoverable action on a commitment was deleting it.

              A pencil beside the ✕, opening the same dialog. Shown on the same
              terms as the remove button rather than always-on: two permanent
              icons on every row is what the hover treatment was avoiding. */}
          {onRename && !item.done ? (
            <button
              type="button"
              onClick={() => setDetail(true)}
              aria-label={`Edit ${item.title}`}
              title="Edit — change the wording or the time"
              className="shrink-0 inline-flex size-5 items-center justify-center rounded-full text-ink-muted/50 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
              style={{ outlineColor: GOALS_ACCENT }}
            >
              <Pencil size={12} />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onRemove(item)}
            /* The label names the DESTINATION, and the three destinations are
               genuinely different (see `abandonPlanItem`): a task goes back to
               Tasks, a goal back to Pull Work, and only a typed commitment is
               binned. Promising the Recycle Bin for all three was the part that
               was actually wrong. */
            aria-label={
              item.taskId
                ? `Take ${item.title} off this day - the task stays in Tasks`
                : item.origin === "goal_related" || item.kind === "weekly"
                  ? `Take ${item.title} off this day - the goal returns to Pull Work`
                  : `Remove ${item.title} - moves it to the Recycle Bin`
            }
            className="shrink-0 inline-flex size-5 items-center justify-center rounded-full text-ink-muted/50 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
            style={{ outlineColor: GOALS_ACCENT }}
          >
            <X size={13} />
          </button>
        </div>

        {/* REVIEW ROW — the four decisions, spelled out. Nothing here fires on
            a drag, a click on the card body, or a keyboard stray.

            It COLLAPSES to nothing at rest: opacity-0 alone still reserved the
            row height, which left a blank strip under every card. */}
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-150 focus-within:grid-rows-[1fr] group-hover:grid-rows-[1fr] max-md:grid-rows-[1fr]">
          <div className="overflow-hidden">
        {/* ONE LINE AT EVERY WIDTH (Sir). Not by wrapping, which cost a line,
            and not by truncating, which cost the word — the chips SCALE to the
            card instead. Five of them need ~270px at full size and a column in
            the 7-day view is 210px, so below that the type and padding step
            down through the container queries on ActionButton until they fit.
            Same five words throughout; only their size changes. */}
        {/* RIGHT-ALIGNED (justify-end): the chips are decisions ABOUT the card
            above them, and ending them at the same edge as the ✕ and the pencil
            puts every action on this card in one column instead of two. */}
        <div className="mt-1 flex flex-nowrap items-center justify-end gap-[2px] pb-0.5 @min-[230px]:gap-1">
            <ActionButton
              label={item.done ? "Undo" : "Done"}
              tone={item.done ? "muted" : "green"}
              busy={busy}
              onClick={() => onToggleDone(item)}
              icon={busy ? <Loader2 size={10} className="animate-spin" /> : undefined}
            />
            {!item.done ? (
              <>
                <ActionButton
                  // "Tomm" and "Day After" at EVERY width and on every day
                  // column (Sir) — the +1 / +2 forms were a third vocabulary
                  // for the same two buttons, and a control that renames itself
                  // depending on which column it is in cannot be learned.
                  label="Tomm"
                  name={dayOffset === 0 ? "Tomorrow" : "The next day"}
                  tone="orange"
                  onClick={() => onTransfer(item.id, dayOffset + 1)}
                />
                <ActionButton
                  label="Day After"
                  name={dayOffset === 0 ? "Day After" : "Two days on"}
                  tone="blue"
                  onClick={() => onTransfer(item.id, dayOffset + 2)}
                />
                <ActionButton
                  label="Pending"
                  tone="red"
                  busy={busy}
                  onClick={() => onPending(item)}
                />
                {/* Duplicate is the ICON at every width (Sir) — two overlapping
                    sheets say "make a copy" on their own, and the name is one
                    hover away. It is also the action least often reached for, so
                    it is the one that can afford to give its width back to the
                    four decisions that matter. */}
                <ActionButton
                  label="Duplicate"
                  tone="yellow"
                  iconOnly
                  icon={<Copy size={11} />}
                  onClick={() => setCopyOpen(true)}
                />
              </>
            ) : null}
        </div>
          </div>
        </div>
      </motion.div>
      {/* The shared "Duplicate to <date>" dialog — see duplicate-date-dialog.tsx.
          It used to be written out inline here, which is why the review row's
          copy button had no picker at all. */}
      {copyOpen ? (
        <DuplicateDateDialog
          item={item}
          defaultYmd={dayYmd}
          onCancel={() => setCopyOpen(false)}
          onConfirm={(ymd) => {
            onDuplicate(item, ymd);
            setCopyOpen(false);
          }}
        />
      ) : null}
      {detail ? (
        <PlanItemDetailModal
          item={item}
          onClose={() => setDetail(false)}
          onRename={onRename}
          onSetTime={onSetTime}
        />
      ) : null}
    </li>
  );
}

/** Per-decision colours, from the app's existing palettes (globals.css):
 *  Done green · Tomorrow orange · Day after blue · Pending red. Pale fill,
 *  matching edge, strong text — the same weight as every other chip here. */
const TONE_STYLE: Record<string, React.CSSProperties> = {
  green: {
    color: "var(--color-green-deep)",
    borderColor: "var(--color-green-edge)",
    background: "var(--color-green-bg)",
  },
  orange: {
    color: "var(--color-orange-deep)",
    borderColor: "var(--color-orange-edge)",
    background: "var(--color-orange-bg)",
  },
  blue: {
    color: "var(--color-blue-deep)",
    borderColor: "var(--color-blue-edge)",
    background: "var(--color-blue-bg)",
  },
  red: {
    color: "var(--color-red-deep)",
    borderColor: "var(--color-red-edge)",
    background: "var(--color-red-bg)",
  },
  yellow: {
    color: "var(--color-yellow-deep)",
    borderColor: "var(--color-yellow-edge)",
    background: "var(--color-yellow-bg)",
  },
  muted: {
    color: "var(--color-ink-soft)",
    borderColor: "var(--color-hairline)",
    background: "var(--color-surface-card)",
  },
};

/** A small labelled action — a WORD, never a bare icon, so nothing is ambiguous. */
function ActionButton({
  label,
  name,
  tone,
  onClick,
  icon,
  busy,
  iconOnly,
}: {
  label: string;
  /** The action's real name, when the visible label abbreviates it. */
  name?: string;
  tone: "green" | "orange" | "blue" | "red" | "yellow" | "muted";
  onClick: () => void;
  icon?: React.ReactNode;
  busy?: boolean;
  /** Icon alone at every width, with the name on hover. */
  iconOnly?: boolean;
}) {
  const style = TONE_STYLE[tone] ?? TONE_STYLE.muted;
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={name ?? label}
      className={
        "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border font-bold transition-[filter] hover:brightness-95 disabled:opacity-50 focus-visible:outline-2 " +
        "text-[8.5px] leading-[13px] @min-[200px]:text-[9.5px] @min-[230px]:text-[10px] @min-[230px]:leading-[15px] @min-[300px]:text-[10.5px] " +
        (iconOnly
          ? "size-[19px] @min-[230px]:size-[23px]"
          : "px-[3px] py-[3px] @min-[200px]:px-1 @min-[230px]:px-1.5")
      }
      style={{ ...style, outlineColor: GOALS_ACCENT }}
    >
      {icon}
      {iconOnly ? null : label}
    </button>
  );
  return iconOnly ? (
    <HoverTip text={name ?? label} className="inline-flex shrink-0">
      {button}
    </HoverTip>
  ) : (
    button
  );
}
