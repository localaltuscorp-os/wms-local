"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Loader2,
  PauseCircle,
  Sunrise,
  UserRound,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { PlanItem, PlanPhase } from "./types";
import { closeMyDay } from "@/app/(app)/goals/plan/actions";
import { autoPunch } from "@/components/attendance/auto-punch";
import { SourceTag, fmtYmd } from "./source-tag";
import { DuplicateDateDialog } from "./duplicate-date-dialog";
import { minToClock } from "@/lib/goals/plan-time";
import { PRIORITY_LABELS } from "@/db/enums";
import { PlanItemHoverCard, TransferControl } from "./item-detail";
import { HoverTip } from "@/components/ui/hover-tip";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;
const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

interface Props {
  phase: Extract<PlanPhase, "active" | "closeout" | "closed">;
  items: PlanItem[];
  /** Move from the day-started screen into the close-out list. */
  onToCloseout: () => void;
  /** Leave the completed-day summary and prepare only upcoming commitments. */
  onViewUpcoming: () => void;
  onResetStart: () => void;
  resettingStart?: boolean;
  /** Back to the BOARD without un-starting the day — the plan stays committed,
   *  you just want to look at it / move things around. */
  onAdjust: () => void;
  onClosed: () => void;
  /** All four decisions are the SAME handlers the kanban cards use, so review
   *  and planning can never disagree about what "done" means. */
  onToggleDone: (item: PlanItem) => void;
  onPending: (item: PlanItem) => void;
  onTransfer: (id: string, off: number) => void;
  /** The day this review belongs to — where the duplicate picker opens. */
  dayYmd: string;
  /** Copy a row onto a CHOSEN day — the picker is DuplicateDateDialog. */
  onDuplicate: (item: PlanItem, ymd?: string) => void;
  /**
   * The × — parks the row in UNFINISHED (the same thing the Pending button
   * does). It used to send the work to the Recycle Bin; see the note on the
   * button itself for why that changed and what it costs.
   */
  onRemove: (item: PlanItem) => void;
  busyId: string | null;
}

/**
 * END-OF-DAY REVIEW — one row per commitment and four buttons (Sir's rule 5).
 *
 * There is NO percentage here, and no slider: a commitment was delivered or it
 * wasn't. If it wasn't, you say where it goes — tomorrow, the day after, or
 * Pending (which parks it in Unfinished). That is the whole screen, so closing
 * out a ten-item day is ten clicks and done.
 */
export function DayReview({
  phase,
  items,
  onToCloseout,
  onViewUpcoming,
  onResetStart,
  resettingStart = false,
  onAdjust,
  onClosed,
  onToggleDone,
  onPending,
  onTransfer,
  dayYmd,
  onDuplicate,
  onRemove,
  busyId,
}: Props) {
  const [busy, setBusy] = React.useState<string | null>(null);
  /** The row whose "Duplicate to" dialog is open, or null. */
  const [copyFor, setCopyFor] = React.useState<PlanItem | null>(null);
  const isClosed = phase === "closed";

  const onFinish = () => {
    setBusy("__finish");
    void closeMyDay()
      .then((r) => {
        if (!r.ok) return fireToast({ message: r.error, type: "error" });
        onClosed();
        // Finish My Day → the existing Check Out. Recognises a manual
        // check-out instead of duplicating it.
        void autoPunch("out");
      })
      .finally(() => setBusy(null));
  };
  // ── ACTIVE — the day is started, before close-out ───────────────────────
  // Restored (Sir). It is the one screen that says "you're set, go and work" —
  // the board is for arranging the day, this is the moment you commit to it.
  if (phase === "active") {
    return (
      <section className="w-full wg-rise">
        <div
          className="rounded-3xl border p-8 text-center max-md:p-6"
          style={{
            borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 26%, transparent)`,
            background: `color-mix(in srgb, ${GOALS_ACCENT} 5%, #fff)`,
          }}
        >
          <h2
            className="flex items-center justify-center gap-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: "-0.02em",
            }}
          >
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-[0_8px_20px_rgba(124,45,18,0.28)]"
              style={{ background: GOALS_GRADIENT }}
              aria-label="Day planned"
            >
              <CheckCircle2 size={21} strokeWidth={2.3} />
            </span>
            Your Day Is Planned
          </h2>
          <ul className="mt-2.5 flex w-full flex-col gap-2 text-left">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded-chip border border-hairline bg-surface-card px-3.5 py-2.5"
              >
                {/* The WHOLE task, and what kind it is (Sir) — this list used to
                    clip to one line, which hid both the end of the sentence and
                    the category tag. */}
                <p
                  className="text-[14px] font-medium leading-[1.4] text-ink-strong"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {it.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <SourceTag kind={it.kind} />
                  {it.timeLabel ? (
                    <span className="text-[11.5px] font-semibold tabular-nums text-ink-muted">{it.timeLabel}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex items-center justify-center gap-3 max-md:flex-col">
            {/* Change Plan FIRST (Sir) — it reads left-to-right as "go back and
                change it, or go on and review it". Back to the board WITHOUT un-starting
                the day: the header there carries "Review My Day", so the plan
                stays committed and the review is one click away. */}
            <button
              type="button"
              onClick={onAdjust}
              className="inline-flex h-12 items-center gap-2 rounded-chip border border-hairline bg-surface-card px-5 text-[14px] font-semibold text-ink-soft hover:border-hairline-strong max-md:w-full"
            >
              <ArrowLeft size={16} /> Change Plan
            </button>
            <button type="button" onClick={onResetStart} disabled={resettingStart} className="inline-flex h-12 items-center gap-2 rounded-chip border border-amber-300 bg-amber-50 px-5 text-[14px] font-semibold text-amber-900 disabled:opacity-60 max-md:w-full">
              {resettingStart ? <Loader2 className="animate-spin" size={16} /> : <Sunrise size={16} />} Reset Start My Day
            </button>
            <button
              type="button"
              onClick={onToCloseout}
              className="wg-btn inline-flex h-12 items-center gap-2 rounded-chip px-6 text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(124,45,18,0.28)] max-md:w-full"
              style={{ background: GOALS_GRADIENT }}
            >
              <ClipboardCheck size={18} /> Review My Day
            </button>
          </div>
        </div>
      </section>
    );
  }


  return (
    <section className="w-full wg-rise">
      <header className="mb-3 flex items-center gap-3 px-1 py-1">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: GOALS_GRADIENT }}
        >
          <ClipboardCheck size={17} />
        </span>
        <div className="min-w-0">
          <h2
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 17 }}
          >
            {isClosed ? "Day closed" : "Review Today"}
          </h2>
        </div>
        {isClosed ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onResetStart} disabled={resettingStart} className="inline-flex h-9 items-center gap-2 rounded-chip border border-amber-300 bg-amber-50 px-3.5 text-[12.5px] font-semibold text-amber-900 disabled:opacity-60">
              {resettingStart ? <Loader2 className="animate-spin" size={14} /> : <Sunrise size={14} />} Reset Start My Day
            </button>
            <button
              type="button"
              onClick={onViewUpcoming}
              className="inline-flex h-9 items-center gap-2 rounded-chip border border-hairline bg-surface-card px-3.5 text-[12.5px] font-semibold text-ink-soft hover:border-hairline-strong"
            >
              Plan upcoming days
            </button>
          </div>
        ) : null}
      </header>

      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const late = it.overdueDays != null && it.overdueDays > 0 ? it.overdueDays : null;
          const showPriority = it.priority != null && it.priority !== "not_imp_not_urgent";
          const start = it.startMin != null ? minToClock(it.startMin) : null;
          const end =
            it.startMin != null && it.durationMin != null ? minToClock(it.startMin + it.durationMin) : null;
          return (
            <ReviewRow key={it.id} item={it} disabled={isClosed}>
              <div className="flex items-start gap-4 max-lg:flex-col max-lg:gap-2">
                <div className="min-w-0 flex-1">
                  {/* HOVER LIVES HERE — on the words, nowhere else (Sir). */}
                  <PlanItemHoverCard item={it}>
                    <p
                      className={
                        "w-fit max-w-full text-[14.5px] font-semibold leading-[1.4] " +
                        (it.done ? "text-ink-subtle line-through" : "text-ink-strong")
                      }
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {it.title}
                    </p>
                  </PlanItemHoverCard>

                  {/* Everything you need to judge the row, on one line: what it
                      is, how late, how important, who asked for it, and the
                      block you set aside for it. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                    <SourceTag kind={it.kind} />
                    {late ? (
                      <span className="font-bold tabular-nums" style={{ color: RISK }}>
                        {late} day{late === 1 ? "" : "s"} overdue
                      </span>
                    ) : null}
                    {showPriority ? (
                      <span
                        className="font-bold"
                        style={{ color: it.priority === "imp_urgent" ? RISK : WARN }}
                      >
                        {PRIORITY_LABELS[it.priority!]}
                      </span>
                    ) : null}
                    {it.assignee ? (
                      <span className="inline-flex items-center gap-1">
                        <UserRound size={11} aria-hidden /> {it.assignee}
                      </span>
                    ) : null}
                    {start ? (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock size={11} aria-hidden /> Start {start}
                      </span>
                    ) : null}
                    {end ? <span className="tabular-nums">End {end}</span> : null}
                    {!start ? <span className="text-ink-muted/70">Anytime</span> : null}
                    {it.pending ? (
                      <span className="font-bold uppercase tracking-[0.06em]" style={{ color: WARN }}>
                        Pending
                      </span>
                    ) : null}
                    {it.carriedForward ? (
                      <span className="font-bold uppercase tracking-[0.06em]" style={{ color: WARN }}>
                        Carried forward{it.fromYmd ? ` · from ${fmtYmd(it.fromYmd)}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                {!isClosed ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <ReviewButton
                      label={it.done ? "Undo" : "Done"}
                      name={it.done ? "Undo" : "Mark done"}
                      tone={it.done ? "muted" : "green"}
                      busy={busyId === it.id}
                      onClick={() => onToggleDone(it)}
                      icon={
                        busyId === it.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} strokeWidth={3} />
                        )
                      }
                    />
                    {!it.done ? (
                      <>
                        <ReviewButton
                          label="Tomm"
                          name="Tomorrow"
                          tone="orange"
                          onClick={() => onTransfer(it.id, 1)}
                        />
                        <ReviewButton label="Day After" tone="blue" onClick={() => onTransfer(it.id, 2)} />
                        <ReviewButton
                          label="Pending"
                          tone="red"
                          busy={busyId === it.id}
                          onClick={() => onPending(it)}
                          icon={<PauseCircle size={12} />}
                        />
                        <TransferControl onTransfer={(off) => onTransfer(it.id, off)} currentOffset={0} />
                      </>
                    ) : null}
                    {/* Copy the row, and the same × the board carries — it sends
                        the work to the Recycle Bin rather than destroying it. */}
                    {/* Opens the date picker rather than copying onto the
                        same day on the spot. The planner card's copy button
                        has always asked "which day?"; this one silently
                        answered "today", so the same icon did two different
                        things depending on which screen you were on. */}
                    <ReviewButton
                      label="Duplicate"
                      tone="yellow"
                      iconOnly
                      onClick={() => setCopyFor(it)}
                      icon={<Copy size={13} />}
                    />
                    {/* × = OFF TODAY'S PLAN, INTO UNFINISHED — not deleted.
                        It used to send the row to the Recycle Bin, which is a
                        destructive read of a button that people press to mean
                        "not today". Note this now lands in the same place the
                        Pending button does; the two are deliberately the same
                        outcome reached from a decision button and from a
                        dismissal. */}
                    <button
                      type="button"
                      onClick={() => onRemove(it)}
                      aria-label={`Move ${it.title} to Unfinished`}
                      title="Not today — moves it to Unfinished"
                      className="inline-flex size-7 items-center justify-center rounded-lg border border-hairline text-ink-muted/70 transition-colors hover:border-hairline-strong hover:text-ink-strong"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
            </ReviewRow>
          );
        })}
      </ul>

      <div className={`mt-5 flex items-center gap-3 max-md:flex-col${isClosed ? " justify-center" : " justify-between max-md:flex-col-reverse"}`}>
        {!isClosed ? (
          <button
            type="button"
            onClick={onAdjust}
            className="inline-flex h-10 items-center gap-2 rounded-chip border border-hairline bg-surface-card px-4 text-[13.5px] font-semibold text-ink-soft hover:border-hairline-strong max-md:w-full"
          >
            <ArrowLeft size={15} /> Change plan
          </button>
        ) : null}
        {!isClosed ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={busy === "__finish"}
            className="wg-btn inline-flex h-10 items-center gap-2 rounded-chip px-5 text-[14px] font-bold text-white shadow-[0_8px_22px_rgba(124,45,18,0.24)] disabled:opacity-50 max-md:w-full"
            style={{ background: GOALS_GRADIENT }}
          >
            {busy === "__finish" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Finish day
          </button>
        ) : (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 text-[13.5px] font-bold"
            style={{ color: GOALS_ACCENT_DEEP }}
          >
            <Sunrise size={15} /> That&apos;s a wrap on today.
          </motion.span>
        )}
      </div>

      {/* The duplicate picker for whichever row asked for it. One dialog for the
          whole list rather than one per row — it is a portal to <body>, so
          mounting 20 of them would be 20 identical overlays waiting to open. */}
      {copyFor ? (
        <DuplicateDateDialog
          item={copyFor}
          defaultYmd={dayYmd}
          onCancel={() => setCopyFor(null)}
          onConfirm={(ymd) => {
            onDuplicate(copyFor, ymd);
            setCopyFor(null);
          }}
        />
      ) : null}
    </section>
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

function ReviewButton({
  label,
  name,
  tone,
  onClick,
  icon,
  busy,
  iconOnly,
}: {
  label: string;
  /**
   * The action's real name, when the visible label is an abbreviation of it.
   * A shortened word saves width on screen but would also shorten what a screen
   * reader announces, so the full name is kept here and used as the accessible
   * name — the letters get shorter, the meaning does not.
   */
  name?: string;
  tone: "green" | "orange" | "blue" | "red" | "yellow" | "muted";
  onClick: () => void;
  icon?: React.ReactNode;
  busy?: boolean;
  /**
   * Drop the word and keep the icon (Sir). The tone, border and height are
   * unchanged, so an icon-only action still sits in the row as one of the set
   * rather than as a different kind of thing — it just stops spending width on
   * a label the icon already gives. The name comes back on hover, and `label`
   * doubles as the accessible name so nothing is lost to a screen reader.
   */
  iconOnly?: boolean;
}) {
  const style = TONE_STYLE[tone] ?? TONE_STYLE.muted;
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={iconOnly ? (name ?? label) : name}
      className={
        "inline-flex items-center gap-1 rounded-lg border text-[11.5px] font-bold transition-[filter] hover:brightness-95 disabled:opacity-50 " +
        (iconOnly ? "size-[26px] justify-center" : "px-2 py-1")
      }
      style={style}
    >
      {icon}
      {iconOnly ? null : label}
    </button>
  );
  // The app's own tooltip, not the native one: it wraps, and it portals out of
  // the row so an overflow-clipped column can't cut it off.
  return iconOnly ? (
    <HoverTip text={name ?? label} className="inline-flex">
      {button}
    </HoverTip>
  ) : (
    button
  );
}

/**
 * One review row — draggable onto the day strip above it (Sir's rule 10).
 *
 * The hover detail belongs to the TASK TEXT, not to this shell: wrapping the
 * whole row meant the panel popped open over Mark Done / Tomorrow / Day after /
 * Pending / Duplicate as the cursor crossed them (Sir).
 *
 * Dragging is the SAME gesture and the same server action the board uses, so a
 * task moved here lands exactly where the kanban would have put it — no second
 * code path, no chance of the two screens disagreeing.
 */
function ReviewRow({
  item,
  disabled,
  children,
}: {
  item: PlanItem;
  /** A closed day is history — nothing on it is draggable. */
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { type: "plan" },
    disabled,
  });

  return (
    <li className="list-none">
        <div
          ref={setNodeRef}
          className="flex items-start gap-2 rounded-none border bg-surface-card px-4 py-3"
          style={{
            transform: CSS.Translate.toString(transform),
            opacity: isDragging ? 0.4 : undefined,
            borderColor: item.done
              ? "color-mix(in srgb, var(--color-green) 34%, transparent)"
              : item.pending
                ? "color-mix(in srgb, var(--color-amber) 45%, transparent)"
                : "var(--color-hairline)",
            background: item.done ? "color-mix(in srgb, var(--color-green) 5%, #fff)" : undefined,
          }}
        >
          {!disabled ? (
            <button
              type="button"
              aria-label={`Drag ${item.title} onto another day`}
              className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-ink-muted/40 hover:text-ink-muted focus-visible:outline-2"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={15} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
    </li>
  );
}
