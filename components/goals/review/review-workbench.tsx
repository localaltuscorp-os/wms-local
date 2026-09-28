"use client";

/**
 * Goals → Review & Scores workbench.
 *
 * ONE review surface over all five planning levels (Daily / Weekly / Monthly /
 * Quarterly / Yearly). The hero level selector is the primary control; below
 * it a slim scoreboard strip and one glass review card per item, each carrying
 * the three review fields — % Done (owner), Approved % (approver) and Approver
 * Notes — all writing through the single `submitReview` action.
 *
 * Altus premium language: brand-red tokens only, glass surfaces, wg-rise /
 * wg-sheen motion (reduced-motion-gated in globals.css), display font +
 * tabular-nums on every stat. Load-neutral — zero new queries, CSS-only depth.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sun,
  CalendarCheck,
  CalendarRange,
  Target,
  Trophy,
  ShieldCheck,
  Check,
  Users,
  Inbox,
  ArrowRight,
  NotebookPen,
  Loader2,
  Search,
  X,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ReviewData, ReviewItem, ReviewLevel } from "@/app/(app)/goals/review/review-data";
import { submitReview } from "@/app/(app)/goals/review/actions";
import { ReviewTable } from "@/components/goals/review/review-table";
import { pctTone, fmtNum } from "@/components/goals/cascade/util";
import { useCountUp } from "@/lib/use-count-up";
import { transferPlanItem } from "@/app/(app)/goals/plan/actions";
import { fireToast } from "@/lib/toast";

/* ------------------------------------------------------------------ */
/* Level metadata — order is the product order: Daily → Yearly          */
/* ------------------------------------------------------------------ */

const LEVELS: Array<{
  key: ReviewLevel;
  label: string;
  caption: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
}> = [
  { key: "daily", label: "Daily", caption: "Day-plan · self-completed", Icon: Sun },
  { key: "weekly", label: "Weekly", caption: "Week goals · approval tier", Icon: CalendarCheck },
  { key: "monthly", label: "Monthly", caption: "Month goals · approval tier", Icon: CalendarRange },
  { key: "quarterly", label: "Quarterly", caption: "Quarter targets", Icon: Target },
  { key: "yearly", label: "Yearly", caption: "FY headline goals", Icon: Trophy },
];

function firstNonEmptyLevelOr(fallback: ReviewLevel, counts: Record<ReviewLevel, number>): ReviewLevel {
  if (counts[fallback] > 0) return fallback;
  const hit = LEVELS.find((l) => counts[l.key] > 0);
  return hit?.key ?? fallback;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Effective score = manager-accepted once reviewed, else the self-rating. */
const effPct = (i: ReviewItem) => i.acceptPct ?? i.pctDone;

/* ------------------------------------------------------------------ */
/* Score ring — hand-rolled SVG arc, tone-coloured, animated            */
/* ------------------------------------------------------------------ */

function ScoreRing({
  pct,
  size = 72,
  stroke = 6.5,
  sub,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  sub?: string;
}) {
  const tone = pctTone(pct);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(clampPct(pct), 900);
  // Animate the arc from empty to its value once mounted (CSS transition —
  // motion-reduce variant snaps straight to the final state).
  const [drawn, setDrawn] = React.useState(false);
  React.useEffect(() => {
    const f = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(f);
  }, []);
  const offset = c - (clampPct(pct) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden={false}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Score ${clampPct(pct)} percent`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={`color-mix(in srgb, ${tone.color} 14%, transparent)`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={tone.color}
          strokeDasharray={c}
          strokeDashoffset={drawn ? offset : c}
          className="transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums leading-none font-semibold"
          style={{
            fontFamily: "var(--font-display, system-ui)",
            color: tone.color,
            fontSize: size >= 64 ? 19 : 14,
          }}
        >
          {shown}
          <span style={{ fontSize: size >= 64 ? 11 : 9, opacity: 0.75 }}>%</span>
        </span>
        {sub ? (
          <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-subtle)" }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tone slider — hand-styled range input (fill = tone colour)           */
/* ------------------------------------------------------------------ */

function ToneSlider({
  value,
  onChange,
  onCommit,
  disabled,
  toneColor,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  disabled?: boolean;
  toneColor: string;
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => onChange(clampPct(Number(e.target.value)))}
      onPointerUp={(e) => onCommit(clampPct(Number((e.target as HTMLInputElement).value)))}
      onKeyUp={(e) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key))
          onCommit(clampPct(Number((e.target as HTMLInputElement).value)));
      }}
      className="rw-range w-full disabled:cursor-not-allowed"
      style={
        {
          "--rw-tone": toneColor,
          "--rw-pct": `${clampPct(value)}%`,
        } as React.CSSProperties
      }
    />
  );
}

function PctBox({
  value,
  onChange,
  onCommit,
  disabled,
  toneColor,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  disabled?: boolean;
  toneColor: string;
  ariaLabel: string;
}) {
  const [text, setText] = React.useState(String(value));
  const num = clampPct(Number(text) || 0);
  // Re-sync only when the PARENT lands on a different number than the box is
  // showing. A blanket `setText(String(value))` would refill an emptied field
  // with "0" the moment it was cleared, which is the bug this is fixing.
  React.useEffect(() => {
    setText((t) => (clampPct(Number(t) || 0) === value ? t : String(value)));
  }, [value]);

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg px-1.5 py-0.5"
      style={{
        background: `color-mix(in srgb, ${toneColor} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${toneColor} 30%, transparent)`,
      }}
    >
      {/* TEXT, NOT `type="number"` — see the long note in review-table.tsx.
          Short version: with a number input React declines to correct the DOM
          when the typed string is only loosely unequal to the value ("0100" ==
          100), and `|| 0` made the leading zero impossible to delete, so typing
          100 into a field showing 0 left "0100" on screen. Selecting the
          contents on focus means typing simply replaces what is there. */}
      <input
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={text}
        aria-label={ariaLabel}
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          // Leading zero dropped once a real digit follows, so typing 1-0-0
          // in front of a standing "0" gives 100 rather than "0100".
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
          setText(digits);
          onChange(clampPct(Number(digits) || 0));
        }}
        onBlur={() => {
          setText(String(num));
          onCommit(num);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-9 bg-transparent text-right text-[13px] font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ color: toneColor, fontFamily: "var(--font-display, system-ui)" }}
      />
      <span className="text-[11px] font-medium" style={{ color: toneColor, opacity: 0.7 }}>
        %
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One review card                                                      */
/* ------------------------------------------------------------------ */

function ReviewCard({
  item,
  canWrite,
  canReview,
  index,
}: {
  item: ReviewItem;
  canWrite: boolean;
  canReview: boolean;
  index: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [self, setSelf] = React.useState(item.pctDone);
  const [accept, setAccept] = React.useState<number>(item.acceptPct ?? item.pctDone);
  const [notes, setNotes] = React.useState(item.reviewNotes ?? "");

  // Re-sync local state whenever the server refresh delivers new truth.
  React.useEffect(() => setSelf(item.pctDone), [item.pctDone]);
  React.useEffect(() => setAccept(item.acceptPct ?? item.pctDone), [item.acceptPct, item.pctDone]);
  React.useEffect(() => setNotes(item.reviewNotes ?? ""), [item.reviewNotes]);

  const eff = item.acceptPct ?? self;
  const tone = pctTone(eff);
  const selfTone = pctTone(self);
  const acceptTone = pctTone(accept);
  const reviewed = item.acceptPct != null;

  const run = (input: Parameters<typeof submitReview>[0], okMsg: string) =>
    startTransition(async () => {
      const res = await submitReview(input);
      if (res.ok) {
        router.refresh();
        fireToast({ message: okMsg, type: "success" });
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });

  const commitSelf = (v: number) => {
    if (!canWrite || v === item.pctDone) return;
    run({ kind: item.kind, id: item.id, self: v }, `${item.title} - set to ${v}% done`);
  };

  const saveApproval = () => {
    if (!canApprove) return;
    if (accept < 100 && !notes.trim()) {
      fireToast({ message: "Add an approver note explaining why this is under 100%." });
      return;
    }
    run(
      { kind: item.kind, id: item.id, acceptPct: accept, reviewNotes: notes.trim() || null },
      `Approved ${accept}% for “${item.title}”`,
    );
  };

  const saveNotesOnBlur = () => {
    if (!canApprove || item.kind === "daily") return;
    if ((notes.trim() || null) === (item.reviewNotes?.trim() || null)) return;
    // Notes always travel WITH the current accepted % — the server treats a
    // notes write as an approval write, so never let it clear the score.
    run(
      { kind: item.kind, id: item.id, acceptPct: item.acceptPct ?? accept, reviewNotes: notes.trim() || null },
      "Review notes saved",
    );
  };

  const toggleDailyDone = () => {
    if (!canWrite) return;
    const next = !item.done;
    run(
      { kind: "daily", id: item.id, done: next, self: next ? 100 : 0 },
      next ? `“${item.title}” marked done` : `“${item.title}” reopened`,
    );
  };

  const saveDailyNote = () => {
    if (!canWrite || item.kind !== "daily") return;
    if ((notes.trim() || null) === (item.reviewNotes?.trim() || null)) return;
    run(
      { kind: "daily", id: item.id, done: item.done ?? false, reviewNotes: notes.trim() || null },
      "Completion note saved",
    );
  };

  const qtyMeta =
    item.targetQty != null
      ? `Tgt ${fmtNum(item.targetQty)} · Act ${fmtNum(item.actualQty)}`
      : item.targetAmount != null
        ? `Tgt Rs. ${fmtNum(item.targetAmount)} · Act Rs. ${fmtNum(item.actualAmount)}`
        : null;

  /** Push an unfinished day item onto another planner day. transferPlanItem
   *  RE-DATES the one row, so it leaves today and lands there — the same move
   *  the planner makes, so the two can never disagree. */
  function moveDaily(offset: number) {
    if (!canWrite || item.kind !== "daily") return;
    startTransition(async () => {
      const res = await transferPlanItem(item.id, offset);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: offset === 1 ? "Moved to tomorrow." : "Moved to the day after." });
      router.refresh();
    });
  }

  /** Leave it open on today — it surfaces tomorrow under Unfinished. Recorded
   *  explicitly so the reviewer has actually DECIDED, rather than skipped it. */
  function markPending() {
    if (!canWrite || item.kind !== "daily") return;
    fireToast({ message: "Left pending - it carries into Unfinished." });
  }

  /** See review-table.tsx and loadApprovableGoalRow — the board-wide
   *  `canReview` cannot express "I raised this one myself", so the initiator is
   *  added as a per-row second key. */
  const canApprove = item.approvable && (canReview || item.initiatedByMe);

  // Anything short of 100 owes the owner a written reason.
  const needsNote = accept < 100 && !notes.trim();

  const notesEditable = item.kind === "daily" ? canWrite : canApprove;

  return (
    <article
      className="wg-rise wg-sheen group relative overflow-hidden rounded-2xl p-4 pl-5 transition-[transform,box-shadow] duration-300 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
      style={{
        animationDelay: `${Math.min(index, 10) * 45}ms`,
        background:
          "linear-gradient(165deg, color-mix(in srgb, var(--color-surface-card) 88%, transparent), color-mix(in srgb, var(--color-surface-soft, var(--color-surface-card)) 96%, transparent))",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 8px 24px -12px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* left tone rail matching the score band */}
      <span
        aria-hidden
        className="absolute inset-y-2.5 left-0 w-[3.5px] rounded-r-full"
        style={{ background: `linear-gradient(180deg, ${tone.color}, color-mix(in srgb, ${tone.color} 55%, transparent))` }}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* score ring */}
        <ScoreRing pct={eff} sub={reviewed ? "accepted" : "self"} />

        {/* identity + controls */}
        <div className="min-w-0 flex-1">
          {/* identity row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {item.area ? (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  color: "var(--color-altus-red-deep)",
                  background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-altus-red) 20%, transparent)",
                }}
              >
                {item.area}
              </span>
            ) : null}
            {reviewed ? (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  color: "var(--color-green-deep)",
                  background: "color-mix(in srgb, var(--color-green) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-green) 30%, transparent)",
                }}
              >
                <ShieldCheck className="h-3 w-3" /> Reviewed
              </span>
            ) : null}
            {reviewed && item.acceptPct !== item.pctDone ? (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                style={{
                  color: "var(--color-ink-soft)",
                  background: "color-mix(in srgb, var(--color-ink-strong) 5%, transparent)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                self {item.pctDone}% <ArrowRight className="h-2.5 w-2.5" /> accepted {item.acceptPct}%
              </span>
            ) : null}
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" style={{ color: "var(--color-altus-red)" }} />
            ) : null}
          </div>

          <h3
            className="mt-1 truncate text-[15px] font-semibold leading-snug"
            style={{ color: "var(--color-ink-strong)", fontFamily: "var(--font-display, system-ui)" }}
            title={item.title}
          >
            {item.title}
          </h3>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]" style={{ color: "var(--color-ink-muted)" }}>
            {item.code ? <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink-soft)" }}>{item.code}</span> : null}
            <span>{item.periodLabel}</span>
            {qtyMeta ? <span className="tabular-nums">{qtyMeta}</span> : null}
            {item.team && item.team.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {item.team.length}
              </span>
            ) : null}
          </p>

          {/* ── controls row: % Done · Approved % (or Done toggle) · Notes ──
               DAILY is deliberately BINARY (Sir): a percentage on a day item slows
               the end-of-day review to a crawl and adds no information — either
               you did it or you carry it forward. So the % control is hidden for
               daily and the row drops to a 2-column layout. */}
          <div
            className={`mt-3.5 grid gap-3.5 border-t pt-3.5 ${item.kind === "daily" ? "md:grid-cols-2" : "md:grid-cols-3"}`}
            style={{ borderColor: "var(--color-hairline)" }}
          >
            {/* % Done — owner self-rating (never for daily) */}
            <div className={`min-w-0 ${item.kind === "daily" ? "hidden" : ""}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-subtle)" }}>
                  % Done <span className="normal-case tracking-normal opacity-70">· self</span>
                </span>
                <PctBox
                  value={self}
                  onChange={setSelf}
                  onCommit={commitSelf}
                  disabled={!canWrite || pending}
                  toneColor={selfTone.color}
                  ariaLabel={`Self percent done for ${item.title}`}
                />
              </div>
              <ToneSlider
                value={self}
                onChange={setSelf}
                onCommit={commitSelf}
                disabled={!canWrite || pending}
                toneColor={selfTone.color}
                ariaLabel={`Self percent done slider for ${item.title}`}
              />
              {!canWrite ? (
                <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-subtle)" }}>
                  Owner-only field
                </p>
              ) : null}
            </div>

            {/* Approved % — approver tier, OR the daily Done toggle */}
            {item.approvable ? (
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-subtle)" }}>
                    Approved % <span className="normal-case tracking-normal opacity-70">· manager</span>
                  </span>
                  <PctBox
                    value={accept}
                    onChange={setAccept}
                    onCommit={() => {}}
                    disabled={!canApprove || pending}
                    toneColor={acceptTone.color}
                    ariaLabel={`Approved percent for ${item.title}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ToneSlider
                    value={accept}
                    onChange={setAccept}
                    onCommit={() => {}}
                    disabled={!canApprove || pending}
                    toneColor={acceptTone.color}
                    ariaLabel={`Approved percent slider for ${item.title}`}
                  />
                  <button
                    type="button"
                    onClick={saveApproval}
                    disabled={!canApprove || pending || needsNote}
                    title={needsNote ? "Add an approver note explaining why this is under 100%." : undefined}
                    className="wg-btn inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      boxShadow: "0 4px 12px -4px color-mix(in srgb, var(--color-altus-red) 55%, transparent)",
                    }}
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                </div>
                {!canApprove ? (
                  <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-subtle)" }}>
                    Approver-only field
                  </p>
                ) : needsNote ? (
                  <p className="mt-1 text-[10px]" style={{ color: "var(--color-altus-red)" }}>
                    Under 100% — an approver note is required.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-subtle)" }}>
                  Completion
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!item.done}
                  onClick={toggleDailyDone}
                  disabled={!canWrite || pending}
                  className="wg-btn inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  style={
                    item.done
                      ? {
                          color: "#fff",
                          background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
                          boxShadow: "0 4px 12px -4px color-mix(in srgb, var(--color-green-deep) 55%, transparent)",
                        }
                      : {
                          color: "var(--color-ink-soft)",
                          background: "var(--color-surface-card)",
                          border: "1px solid var(--color-hairline-strong)",
                        }
                  }
                >
                  <span
                    aria-hidden
                    className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors motion-reduce:transition-none"
                    style={{
                      background: item.done ? "rgba(255,255,255,0.35)" : "color-mix(in srgb, var(--color-ink-strong) 14%, transparent)",
                    }}
                  >
                    <span
                      className="absolute h-3 w-3 rounded-full bg-white shadow transition-[left] duration-200 motion-reduce:transition-none"
                      style={{ left: item.done ? 15 : 2 }}
                    />
                  </span>
                  {item.done ? "Done" : "Mark done"}
                </button>
                {/* NOT DONE → decide where it goes, in one click (Sir: "so his
                    daily review will work faster at the end of the day — he will
                    automatically know what he will attempt tomorrow"). Moving
                    RE-DATES the single plan row, so the item lands on that day's
                    plan and leaves today; it can never end up on two days. */}
                {!item.done && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveDaily(1)}
                      disabled={!canWrite || pending}
                      className="rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-ink-strong disabled:opacity-45"
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDaily(2)}
                      disabled={!canWrite || pending}
                      className="rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-ink-strong disabled:opacity-45"
                    >
                      Day after
                    </button>
                    <button
                      type="button"
                      onClick={() => markPending()}
                      disabled={!canWrite || pending}
                      title="Leave it open - it carries into Unfinished"
                      className="rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-ink-strong disabled:opacity-45"
                    >
                      Pending
                    </button>
                  </div>
                )}
                <p className="mt-1.5 text-[10px]" style={{ color: "var(--color-ink-subtle)" }}>
                  {item.done ? "self-completed · no approval needed" : "done, or send it to a day"}
                </p>
              </div>
            )}

            {/* Approver Notes / daily completion note */}
            <div className="min-w-0">
              <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-subtle)" }}>
                <NotebookPen className="h-3 w-3" />
                {item.kind === "daily" ? "Completion note" : "Approver notes"}
              </span>
              {notesEditable ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={item.kind === "daily" ? saveDailyNote : saveNotesOnBlur}
                  disabled={pending}
                  rows={2}
                  placeholder={item.kind === "daily" ? "How did it go? (saves on blur)" : "Feedback for the owner… (saves on blur)"}
                  className="w-full resize-none rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed outline-none transition-shadow focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                  style={
                    {
                      color: "var(--color-ink-strong)",
                      background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)",
                      border: "1px solid var(--color-hairline-strong)",
                      // focus ring in brand red via the CSS var the ring utility consumes
                      "--tw-ring-color": "color-mix(in srgb, var(--color-altus-red) 35%, transparent)",
                    } as React.CSSProperties
                  }
                />
              ) : notes.trim() ? (
                <blockquote
                  className="rounded-lg border-l-2 px-2.5 py-1.5 text-[12px] italic leading-relaxed"
                  style={{
                    color: "var(--color-ink-soft)",
                    borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
                    background: "color-mix(in srgb, var(--color-altus-red) 4%, transparent)",
                  }}
                >
                  “{notes.trim()}”
                </blockquote>
              ) : (
                <p className="text-[11px] italic" style={{ color: "var(--color-ink-subtle)" }}>
                  No notes yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Summary strip for the active level                                   */
/* ------------------------------------------------------------------ */

function SummaryStrip({ level, items }: { level: ReviewLevel; items: ReviewItem[] }) {
  const total = items.length;
  const avg = total ? Math.round(items.reduce((s, i) => s + effPct(i), 0) / total) : 0;
  const reviewedCount = items.filter((i) => (i.approvable ? i.acceptPct != null : !!i.done)).length;
  const pendingCount = total - reviewedCount;
  const nTotal = useCountUp(total, 800);
  const nReviewed = useCountUp(reviewedCount, 800);
  const nPending = useCountUp(pendingCount, 800);
  const tone = pctTone(avg);
  const reviewedWord = level === "daily" ? "done" : "reviewed";

  if (total === 0) return null;
  return (
    <div
      className="wg-rise flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-soft px-3 py-2"
      style={{
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card px-2 py-1">
        <ScoreRing pct={avg} size={32} stroke={4} />
        <div className="leading-tight">
          <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-subtle)" }}>
            Avg
          </p>
          <p className="text-[10px] font-medium capitalize" style={{ color: tone.color }}>
            {tone.band} band
          </p>
        </div>
      </div>
      <span aria-hidden className="hidden h-6 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
      <p className="rounded-md border border-hairline bg-surface-card px-2.5 py-1 text-[12px] tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
        <strong style={{ color: "var(--color-green-deep)", fontFamily: "var(--font-display, system-ui)" }}>{nReviewed}</strong> {reviewedWord}
        <span className="mx-1.5" style={{ color: "var(--color-ink-subtle)" }}>·</span>
        <strong style={{ color: "var(--color-altus-red-deep)", fontFamily: "var(--font-display, system-ui)" }}>{nPending}</strong> pending
        <span className="mx-1.5" style={{ color: "var(--color-ink-subtle)" }}>·</span>
        <strong style={{ color: "var(--color-ink-strong)", fontFamily: "var(--font-display, system-ui)" }}>{nTotal}</strong>{" "}
        {total === 1 ? "goal" : "goals"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */

function EmptyLevel({ level, counts, onSwitch, fyStartYear }: {
  level: ReviewLevel;
  counts: Record<ReviewLevel, number>;
  onSwitch: (l: ReviewLevel) => void;
  fyStartYear: number;
}) {
  const alt = LEVELS.find((l) => l.key !== level && counts[l.key] > 0);
  const entireYearEmpty = Object.values(counts).every((count) => count === 0);
  return (
    <div
      className="wg-rise flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center"
      style={{
        background: "color-mix(in srgb, var(--color-surface-card) 75%, transparent)",
        border: "1px dashed var(--color-hairline-strong)",
      }}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, transparent)",
        }}
      >
        <Inbox className="h-5 w-5" style={{ color: "var(--color-altus-red)" }} />
      </span>
      <p className="text-[14px] font-semibold" style={{ color: "var(--color-ink-strong)", fontFamily: "var(--font-display, system-ui)" }}>
        {entireYearEmpty
          ? `No goals to review in FY ${fyStartYear}–${String((fyStartYear + 1) % 100).padStart(2, "0")} yet.`
          : `No ${level} goals to review yet.`}
      </p>
      {alt ? (
        <button
          type="button"
          onClick={() => onSwitch(alt.key)}
          className="wg-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
          style={{
            color: "var(--color-altus-red-deep)",
            background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 22%, transparent)",
          }}
        >
          Review {alt.label} instead ({counts[alt.key]}) <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
          Goals appear here as they're planned for this financial year.
        </p>
      )}
    </div>
  );
}

type ReviewOverviewFilter = "all" | "selfComplete" | "pending" | "awaitingApproval" | "reviewed" | "inProgress" | "notStarted";

function ReviewOverview({
  items,
  activeFilter,
  onFilterChange,
}: {
  items: ReviewItem[];
  activeFilter: ReviewOverviewFilter;
  onFilterChange: (filter: ReviewOverviewFilter) => void;
}) {
  const reviewed = items.filter((item) => item.approvable && item.acceptPct != null).length;
  const awaitingApproval = items.filter((item) => item.approvable && item.acceptPct == null && item.pctDone > 0).length;
  const selfComplete = items.filter((item) => item.pctDone >= 100).length;
  const pending = items.length - selfComplete;
  const inProgress = items.filter((item) => item.pctDone > 0 && item.pctDone < 100).length;
  const notStarted = items.filter((item) => item.pctDone === 0).length;
  const metrics: { key: ReviewOverviewFilter; label: string; value: number; tone: string }[] = [
    { key: "all", label: "Total", value: items.length, tone: "#1d4ed8" },
    { key: "selfComplete", label: "Self complete", value: selfComplete, tone: "#16a34a" },
    { key: "pending", label: "Pending", value: pending, tone: "#dc2626" },
    { key: "awaitingApproval", label: "Awaiting approval", value: awaitingApproval, tone: "#d97706" },
    { key: "reviewed", label: "Reviewed", value: reviewed, tone: "#7c3aed" },
    { key: "inProgress", label: "In progress", value: inProgress, tone: "#0891b2" },
    { key: "notStarted", label: "Not started", value: notStarted, tone: "#94a3b8" },
  ];

  return (
    <section aria-label="Review overview" className="flex shrink-0 flex-nowrap items-center gap-2">
      {metrics.map((metric) => (
        <button
          key={metric.key}
          type="button"
          aria-pressed={activeFilter === metric.key}
          onClick={() => onFilterChange(metric.key === "all" || activeFilter === metric.key ? "all" : metric.key)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface-card px-3 text-[13px] transition-colors hover:bg-surface-soft"
          style={activeFilter === metric.key ? { borderColor: metric.tone, boxShadow: `0 0 0 2px color-mix(in srgb, ${metric.tone} 18%, transparent)` } : undefined}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.tone }} aria-hidden />
          <strong className="tabular-nums text-ink-strong">{metric.value}</strong>
          <span className="font-semibold text-ink-soft">{metric.label}</span>
        </button>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The workbench                                                        */
/* ------------------------------------------------------------------ */

export function ReviewWorkbench({
  data,
  headerControls,
}: {
  data: ReviewData;
  headerControls?: React.ReactNode;
}) {
  const [level, setLevel] = React.useState<ReviewLevel>(() =>
    firstNonEmptyLevelOr("monthly", data.counts),
  );
  const [fullscreen, setFullscreen] = React.useState(false);
  const items = data.levels[level];
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [overviewFilter, setOverviewFilter] = React.useState<ReviewOverviewFilter>("all");
  const [pageSize, setPageSize] = React.useState(20);
  const [page, setPage] = React.useState(1);
  const visibleItems = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchesOverview = (item: ReviewItem) => {
      if (overviewFilter === "all") return true;
      if (overviewFilter === "selfComplete") return item.pctDone >= 100;
      if (overviewFilter === "pending") return item.pctDone < 100;
      if (overviewFilter === "awaitingApproval") return item.approvable && item.acceptPct == null && item.pctDone > 0;
      if (overviewFilter === "reviewed") return item.approvable && item.acceptPct != null;
      if (overviewFilter === "inProgress") return item.pctDone > 0 && item.pctDone < 100;
      return item.pctDone === 0;
    };
    const overviewItems = items.filter(matchesOverview);
    if (!query) return overviewItems;
    return overviewItems.filter((item) =>
      [item.title, item.code, item.area, item.category, item.periodLabel, item.reviewNotes]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query)),
    );
  }, [items, search, overviewFilter]);
  const orderedItems = visibleItems;
  const pageCount = Math.max(1, Math.ceil(orderedItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstRow = orderedItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, orderedItems.length);
  const pagedItems = orderedItems.slice(firstRow - 1, lastRow);

  React.useEffect(() => setPage(1), [level, search, pageSize, overviewFilter]);
  const active = LEVELS.find((l) => l.key === level)!;
  const compactTabs = (
    <nav aria-label="Review level" className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-hairline-strong bg-surface-soft p-1">
      {LEVELS.map(({ key, label }) => {
        const activeBtn = key === level;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setLevel(key)}
            aria-pressed={activeBtn}
            aria-current={activeBtn ? "page" : undefined}
            className="wg-btn inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold transition-colors"
            style={
              activeBtn
                ? {
                    color: "white",
                    background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    boxShadow: "0 3px 8px -4px color-mix(in srgb, var(--color-altus-red) 65%, transparent)",
                  }
                : { color: "var(--color-ink-strong)" }
            }
          >
            {label}
            <span
              className="rounded-pill px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              style={{
                color: activeBtn ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)",
                background: activeBtn ? "rgba(255,255,255,0.9)" : "color-mix(in srgb, var(--color-ink-strong) 6%, transparent)",
              }}
            >
              {data.counts[key]}
            </span>
          </button>
        );
      })}
    </nav>
  );

  React.useEffect(() => {
    if (!fullscreen) return;
    const leaveFullscreen = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", leaveFullscreen);
    return () => window.removeEventListener("keydown", leaveFullscreen);
  }, [fullscreen]);

  return (
    <div className={fullscreen ? "fixed inset-0 z-[100] flex overflow-auto bg-surface-base p-5" : "flex flex-col gap-4"}>
      <div className={fullscreen ? "mx-auto flex w-full max-w-[1800px] flex-col gap-4" : "contents"}>
      <header className="flex w-full flex-wrap items-center gap-3">
        <h1 className="shrink-0 text-[28px] font-black leading-none text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
          Review &amp; Scores
        </h1>
        <div className="min-w-0 max-w-full">{compactTabs}</div>
      </header>
      <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto">
        <ReviewOverview items={items} activeFilter={overviewFilter} onFilterChange={setOverviewFilter} />
        <button
          type="button"
          onClick={() => setFullscreen((value) => !value)}
          aria-pressed={fullscreen}
          title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft"
        >
          {fullscreen ? <Minimize2 size={14} strokeWidth={2.2} /> : <Maximize2 size={14} strokeWidth={2.2} />}
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      {/* scoped slider styling - tone-filled track, tactile thumb */}
      <style>{`
        .rw-range{appearance:none;-webkit-appearance:none;height:6px;border-radius:999px;outline:none;cursor:pointer;
          background:linear-gradient(to right,var(--rw-tone) 0%,var(--rw-tone) var(--rw-pct),color-mix(in srgb,var(--color-ink-strong) 9%,transparent) var(--rw-pct),color-mix(in srgb,var(--color-ink-strong) 9%,transparent) 100%);}
        .rw-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:17px;height:17px;border-radius:50%;
          background:#fff;border:2.5px solid var(--rw-tone);box-shadow:0 1px 4px rgba(15,23,42,0.25);transition:transform .15s ease;}
        .rw-range:not(:disabled)::-webkit-slider-thumb:hover{transform:scale(1.18);}
        .rw-range::-moz-range-thumb{width:17px;height:17px;border-radius:50%;background:#fff;border:2.5px solid var(--rw-tone);
          box-shadow:0 1px 4px rgba(15,23,42,0.25);transition:transform .15s ease;}
        .rw-range:not(:disabled)::-moz-range-thumb:hover{transform:scale(1.18);}
        .rw-range:disabled{opacity:.45;}
        .rw-range:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--rw-tone) 30%,transparent);}
        @media (prefers-reduced-motion: reduce){
          .rw-range::-webkit-slider-thumb,.rw-range::-moz-range-thumb{transition:none;}
        }
      `}</style>

      {/* ── (1) HERO LEVEL SELECTOR ── */}
      <nav aria-label="Review level" className="hidden">
        {LEVELS.map(({ key, label, caption, Icon }) => {
          const activeBtn = key === level;
          const count = data.counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLevel(key)}
              aria-pressed={activeBtn}
              aria-current={activeBtn ? "page" : undefined}
              className={`wg-btn group relative flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-left transition-[transform,box-shadow,background] duration-200 motion-reduce:transition-none ${
                activeBtn ? "" : "hover:bg-surface-card"
              }`}
              style={
                activeBtn
                  ? {
                      background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      border: "1px solid var(--color-altus-red-deep)",
                      boxShadow: "0 4px 10px -5px color-mix(in srgb, var(--color-altus-red) 65%, transparent)",
                    }
                  : {
                      background: "transparent",
                      border: "1px solid transparent",
                    }
              }
            >
              <span className="flex items-center">
                <Icon
                  className="h-4 w-4 transition-colors motion-reduce:transition-none"
                  strokeWidth={2.25}
                  style={activeBtn ? { color: "rgba(255,255,255,0.9)" } : { color: "var(--color-ink-subtle)" }}
                />
                <span
                  className="rounded-pill px-2 py-0.5 text-[11px] font-bold tabular-nums"
                  style={
                    activeBtn
                      ? { color: "var(--color-altus-red-deep)", background: "rgba(255,255,255,0.92)" }
                      : {
                          color: count > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)",
                          background:
                            count > 0
                              ? "color-mix(in srgb, var(--color-altus-red) 10%, transparent)"
                              : "color-mix(in srgb, var(--color-ink-strong) 5%, transparent)",
                        }
                  }
                >
                  {count}
                </span>
              </span>
              <span
                className={`text-[14px] font-bold leading-tight transition-colors motion-reduce:transition-none ${
                  activeBtn ? "text-white" : "group-hover:text-[var(--color-altus-red)]"
                }`}
                style={{
                  fontFamily: "var(--font-display, system-ui)",
                  ...(activeBtn ? {} : { color: "var(--color-ink-strong)" }),
                }}
              >
                {label}
              </span>
              <span
                className="hidden text-[10.5px] leading-tight"
                style={activeBtn ? { color: "rgba(255,255,255,0.75)" } : { color: "var(--color-ink-muted)" }}
              >
                {caption}
              </span>
            </button>
          );
        })}
      </nav>

      {/* one-line summary of the active level */}
      {false && <p className="text-[12.5px]" style={{ color: "var(--color-ink-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
          {active.label}
        </span>{" "}
        - reviewing {data.viewedName}'s {level} items for FY {data.fyStartYear}–
        {String((data.fyStartYear + 1) % 100).padStart(2, "0")}
        {level === "daily" ? " (self-completed; no approval tier)" : ""}.
      </p>}

      {/* ── (2) summary strip ── */}

      {/* ── (3) review cards / (4) empty state ── */}
      {items.length === 0 ? (
        <>
          <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-hairline bg-surface-card p-1" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search review items"
              title="Search"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <Search size={20} aria-hidden />
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-2">{headerControls}</div>
            <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-soft">
              <span className="whitespace-nowrap font-semibold">0–0 / 0</span>
              <span className="inline-flex h-9 items-center rounded-lg border border-hairline bg-surface-card px-2 font-bold text-ink-strong">{pageSize}</span>
              <button type="button" disabled aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-surface-card opacity-40"><ChevronLeft size={16} /></button>
              <span className="whitespace-nowrap font-semibold">1/1</span>
              <button type="button" disabled aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-surface-card opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
          <EmptyLevel level={level} counts={data.counts} onSwitch={setLevel} fyStartYear={data.fyStartYear} />
        </>
      ) : (
        <div key={level}>
          <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-hairline bg-surface-card p-1" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            {searchOpen ? (
              <div className="relative min-w-[260px] flex-1">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search goals, category or notes"
                  aria-label="Search goals in this review period"
                  className="h-9 w-full rounded-lg border border-transparent bg-surface-soft pl-9 pr-8 text-[13px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                  aria-label="Close goal search"
                  className="absolute right-2 top-1/2 rounded p-1 text-ink-subtle hover:text-ink-strong"
                  style={{ transform: "translateY(-50%)" }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search review items"
                title="Search"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                <Search size={20} aria-hidden />
              </button>
            )}
            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">{headerControls}</div>
            <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-soft">
                <span className="font-semibold">
                  Showing {pagedItems.length} {pagedItems.length === 1 ? "row" : "rows"} · {firstRow}–{lastRow} of {orderedItems.length}
                </span>
                <label className="inline-flex h-9 items-center gap-1 rounded-lg border border-hairline bg-surface-card px-2 font-semibold">
                  <span className="sr-only">Rows per page</span>
                  <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="bg-transparent font-bold text-ink-strong outline-none" aria-label="Rows per page">
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </label>
                <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-surface-card disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button>
                <span className="whitespace-nowrap font-semibold">{currentPage}/{pageCount}</span>
                <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-surface-card disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
              </div>
          </div>
          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline-strong bg-surface-card px-5 py-10 text-center text-[13px] text-ink-muted">
              No goals match “{search}”.
            </div>
          ) : (
          <ReviewTable
            items={pagedItems}
            canWrite={data.canWrite}
            canReview={data.canReview}
            typeOptions={data.typeOptions}
            customTypes={data.customTypes}
          />
          )}
        </div>
      )}
      </div>
    </div>
  );
}
