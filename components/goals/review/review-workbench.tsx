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
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg px-1.5 py-0.5"
      style={{
        background: `color-mix(in srgb, ${toneColor} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${toneColor} 30%, transparent)`,
      }}
    >
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => onChange(clampPct(Number(e.target.value) || 0))}
        onBlur={(e) => onCommit(clampPct(Number(e.target.value) || 0))}
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
    run({ kind: item.kind, id: item.id, self: v }, `${item.title} — set to ${v}% done`);
  };

  const saveApproval = () => {
    if (!canReview) return;
    run(
      { kind: item.kind, id: item.id, acceptPct: accept, reviewNotes: notes.trim() || null },
      `Approved ${accept}% for “${item.title}”`,
    );
  };

  const saveNotesOnBlur = () => {
    if (!canReview || item.kind === "daily") return;
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
        ? `Tgt ₹${fmtNum(item.targetAmount)} · Act ₹${fmtNum(item.actualAmount)}`
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

  const notesEditable = item.kind === "daily" ? canWrite : canReview;

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
                    disabled={!canReview || pending}
                    toneColor={acceptTone.color}
                    ariaLabel={`Approved percent for ${item.title}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ToneSlider
                    value={accept}
                    onChange={setAccept}
                    onCommit={() => {}}
                    disabled={!canReview || pending}
                    toneColor={acceptTone.color}
                    ariaLabel={`Approved percent slider for ${item.title}`}
                  />
                  <button
                    type="button"
                    onClick={saveApproval}
                    disabled={!canReview || pending}
                    className="wg-btn inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      boxShadow: "0 4px 12px -4px color-mix(in srgb, var(--color-altus-red) 55%, transparent)",
                    }}
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                </div>
                {!canReview ? (
                  <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-subtle)" }}>
                    Approver-only field
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
      className="wg-rise flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-2.5"
      style={{
        background: "color-mix(in srgb, var(--color-surface-card) 70%, transparent)",
        border: "1px solid var(--color-hairline)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <ScoreRing pct={avg} size={46} stroke={5} />
        <div className="leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-subtle)" }}>
            Avg score
          </p>
          <p className="text-[12px] font-medium capitalize" style={{ color: tone.color }}>
            {tone.band} band
          </p>
        </div>
      </div>
      <span aria-hidden className="hidden h-7 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
      <p className="text-[13px] tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
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

function EmptyLevel({ level, counts, onSwitch }: {
  level: ReviewLevel;
  counts: Record<ReviewLevel, number>;
  onSwitch: (l: ReviewLevel) => void;
}) {
  const alt = LEVELS.find((l) => l.key !== level && counts[l.key] > 0);
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
        No {level} goals to review yet.
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

/* ------------------------------------------------------------------ */
/* The workbench                                                        */
/* ------------------------------------------------------------------ */

export function ReviewWorkbench({ data }: { data: ReviewData }) {
  const [level, setLevel] = React.useState<ReviewLevel>(() =>
    firstNonEmptyLevelOr("monthly", data.counts),
  );
  const items = data.levels[level];
  const active = LEVELS.find((l) => l.key === level)!;

  return (
    <div className="flex flex-col gap-4">
      {/* scoped slider styling — tone-filled track, tactile thumb */}
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
      <nav aria-label="Review level" className="wg-rise grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {LEVELS.map(({ key, label, caption, Icon }) => {
          const activeBtn = key === level;
          const count = data.counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLevel(key)}
              aria-pressed={activeBtn}
              className={`wg-btn wg-sheen group relative flex flex-col items-start gap-1 overflow-hidden rounded-2xl px-4 py-3.5 text-left transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none ${
                activeBtn ? "" : "hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              }`}
              style={
                activeBtn
                  ? {
                      background: "linear-gradient(140deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      border: "1px solid var(--color-altus-red-deep)",
                      boxShadow:
                        "0 10px 28px -8px color-mix(in srgb, var(--color-altus-red) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
                      transform: "translateY(-2px)",
                    }
                  : {
                      background: "color-mix(in srgb, var(--color-surface-card) 85%, transparent)",
                      border: "1px solid var(--color-hairline-strong)",
                      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                    }
              }
            >
              <span className="flex w-full items-center justify-between">
                <Icon
                  className="h-[18px] w-[18px] transition-colors motion-reduce:transition-none"
                  strokeWidth={2.25}
                  style={activeBtn ? { color: "rgba(255,255,255,0.9)" } : { color: "var(--color-ink-subtle)" }}
                />
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
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
                className={`text-[16px] font-bold leading-tight transition-colors motion-reduce:transition-none ${
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
                className="text-[10.5px] leading-tight"
                style={activeBtn ? { color: "rgba(255,255,255,0.75)" } : { color: "var(--color-ink-muted)" }}
              >
                {caption}
              </span>
            </button>
          );
        })}
      </nav>

      {/* one-line summary of the active level */}
      <p className="text-[12.5px]" style={{ color: "var(--color-ink-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
          {active.label}
        </span>{" "}
        — reviewing {data.viewedName}'s {level} items for FY {data.fyStartYear}–
        {String((data.fyStartYear + 1) % 100).padStart(2, "0")}
        {level === "daily" ? " (self-completed; no approval tier)" : ""}.
      </p>

      {/* ── (2) summary strip ── */}
      <SummaryStrip level={level} items={items} />

      {/* ── (3) review cards / (4) empty state ── */}
      {items.length === 0 ? (
        <EmptyLevel level={level} counts={data.counts} onSwitch={setLevel} />
      ) : (
        <div key={level}>
          <ReviewTable
            items={items}
            canWrite={data.canWrite}
            canReview={data.canReview}
            typeOptions={data.typeOptions}
            customTypes={data.customTypes}
          />
        </div>
      )}
    </div>
  );
}
