"use client";

/**
 * Goals Canvas — GOAL CONTAINER (Phase 3, design §2.3 + §4.1).
 *
 * THE single planning card. It merges the 3 divergent goal cards (the cockpit
 * `goal-card.tsx` chip-strip, the zoom-canvas ObjectiveRow/MilestoneChip, and
 * the peek panel's editing zones) into ONE unified surface (the Exec/Ops mode
 * split is GONE): two calm identity/vitals lines, with the heavy instruments —
 * slider + 0/25/50/75/100 chips, mic-dictation notes, team avatars + picker,
 * Move to… — folded behind "More". Inline-edit title (Enter/Esc) reveals on
 * hover/focus. ALL inline, NO modals. Writes gate on `canWrite` (WHO you are),
 * never on a view mode — view-only people get the same layout with write
 * controls UNMOUNTED (§2.7).
 *
 * Two flavours share the skin: <GoalContainer/> (cascade `goals` rows, writes
 * through the shell's GoalMutationApi) and <WeeklyGoalContainer/> (weekly
 * rows — Phase 3 folded Week in as an EDITABLE stage; writes route through
 * weekly actions ONLY so ritual stamps stay on weekly_goals, §4.3).
 *
 * The card's motion `layoutId` (`node-<id>` / `wnode-<id>`) is shared with the
 * ParentContextPanel hero — drilling a child MORPHS it into the LEFT panel
 * (design §2.7 zoom-drill continuity).
 *
 * HARD LAWS: zero queries; amber identity (var(--module-accent)) — brand-red
 * FORBIDDEN; the only red is semantic at-risk/spillover #b91c1c; no CSS
 * zoom/transform on ancestors; motion reduced-motion-gated; keyboard-first.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type DragControls } from "motion/react";
import { ArrowRightLeft, Check, ChevronDown, ChevronRight, GripVertical, Loader2, Pencil, Plus, StickyNote, UserPlus, X } from "lucide-react";
import {
  effectiveGoalPct,
  fmtNum,
  goalCode,
  isSpillover,
  originStyle,
  pctTone,
  periodKeyLabel,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import {
  fyStartYearOfKey,
  monthKeysOfFy,
  quarterKeyOfMonthKey,
  quartersOfFy,
} from "@/lib/goals/types";
import { fyWeeks } from "@/lib/goals/fy-calendar";
import { ACCENT, ACCENT_DEEP, DUR, EASE_OUT, SPRING, accentMix, SEM_RISK } from "./tokens";
import { POLICY_REASONS } from "@/lib/goals/policy";
import { asNum, deriveHealth, isUnmeasured, type DerivedHealth } from "@/lib/goals/derive";
import { fireToast } from "@/lib/toast";
import { DateInput } from "@/components/ui/date-input";
import {
  editGoal,
  moveGoalAcross,
  moveGoalToLevel,
  setGoalPctDone,
  setGoalTeam,
} from "@/app/(app)/goals/cascade/actions";
import { setCommitProgress } from "@/app/(app)/goals/commit/actions";
import {
  setWeeklyTitle,
  updateWeeklyCascadeFields,
  setWeeklyAdopted,
} from "@/app/(app)/goals/weekly/actions";
import { AnimatedNumber, ContributionBadge } from "./allocation";
import { MicButton, useDictation } from "./dictation";
import { TeamAvatarStack, TeamPicker, type TeamMember } from "./people";
import { useCanvasShell } from "./shell-context";
import { mondayKeyOf, weekNoOf, weekRangeLabel } from "./stage";
import type { GoalPatch } from "./optimistic";
import type { WeeklyDTO, ZoomLevel } from "./types";

/* ------------------------------------------------------------------ */
/* Constants + tiny atoms                                              */
/* ------------------------------------------------------------------ */

/* Accent, ramp + spring come from the design contract (tokens.ts, §2.0). */
const RISK_RED = SEM_RISK; // the ONLY red allowed here (semantic)

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * §2.7 saving law — a 300ms grace before ANY save spinner appears: the
 * optimistic spine settles most writes faster than that, and a flashing
 * spinner only advertises latency. Render conditionally (`{busy && <…/>}`) —
 * the mount delay does the rest.
 */
export function DelayedSpinner(props: { size?: number; className?: string }): React.JSX.Element | null {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 300);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  // Color is caller-owned (defaults muted) so in-button spinners can inherit.
  return (
    <Loader2
      size={props.size ?? 12}
      className={`animate-spin ${props.className ?? "text-ink-muted"}`}
    />
  );
}

/** Tiny SVG progress ring (shared card scale). */
export function Ring(props: { pct: number; size?: number; stroke?: number }): React.JSX.Element {
  const size = props.size ?? 30;
  const stroke = props.stroke ?? 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clampPct(props.pct);
  const color = pctTone(pct).color;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accentMix(14)} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
      />
    </svg>
  );
}

export function HealthChip({ h }: { h: DerivedHealth }): React.JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] tabular-nums"
      style={{ color: h.color, background: h.bg }}
      title={`${h.effective}% done vs ${h.expected}% expected pace`}
    >
      {h.label}
      {h.band !== "done" && (
        <span aria-hidden="true">{h.delta >= 0 ? `▲${h.delta}` : `▼${Math.abs(h.delta)}`}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Inline title (Enter commits, Esc reverts — no modal)                */
/* ------------------------------------------------------------------ */

function InlineTitle(props: {
  value: string;
  canWrite: boolean;
  busy: boolean;
  onCommit: (next: string) => void;
  strong?: boolean;
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(props.value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  React.useEffect(() => setDraft(props.value), [props.value]);

  if (!editing) {
    return (
      <span className="group/title inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span
          className={`truncate text-left ${props.strong ? "text-[15px]" : "text-[14px]"} font-bold text-ink-strong`}
          style={{ overflowWrap: "anywhere" }}
        >
          {props.value}
        </span>
        {props.canWrite && (
          // Ghost pencil — 0 opacity until hover/focus-within (§ Unify: edit
          // affordances reveal, never permanent input chrome).
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(props.value);
              setEditing(true);
            }}
            aria-label="Edit title"
            className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-ink-strong group-hover/title:opacity-100 group-focus-within/title:opacity-100 focus-visible:opacity-100"
          >
            <Pencil size={12} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
        {props.busy && <DelayedSpinner size={11} className="shrink-0 text-ink-muted" />}
      </span>
    );
  }
  return (
    <input
      ref={inputRef}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value.slice(0, 400))}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          const t = draft.trim();
          setEditing(false);
          if (t && t !== props.value) props.onCommit(t);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(props.value);
          setEditing(false);
        }
      }}
      aria-label="Goal title"
      className="w-full min-w-0 rounded-lg border bg-transparent px-2 py-1 text-[14px] font-bold text-ink-strong outline-none"
      style={{ borderColor: accentMix(45), background: accentMix(5) }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Combined measure chip — "12 of 40 visits", tap to edit either        */
/* (§2.6: Tgt + Act fold into ONE line-2 chip; two chips → one target)  */
/* ------------------------------------------------------------------ */

function MeasurePairChip(props: {
  target: number | null;
  actual: number | null;
  rupee: boolean;
  uom: string | null;
  canWrite: boolean;
  /** Option A — false on a CASCADED goal for non-structure viewers: the Tgt
   *  field renders read-only-with-reason while Act stays fully editable
   *  (progress is the owner's). Default true. */
  canEditTarget?: boolean;
  busy: boolean;
  onCommitTarget: (n: number | null) => void;
  onCommitActual: (n: number | null) => void;
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const [actDraft, setActDraft] = React.useState("");
  const [tgtDraft, setTgtDraft] = React.useState("");
  const actRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (editing) {
      setActDraft(props.actual != null ? String(props.actual) : "");
      setTgtDraft(props.target != null ? String(props.target) : "");
      actRef.current?.focus();
      actRef.current?.select();
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = (n: number | null) => (n == null ? "—" : props.rupee ? `₹${fmtNum(n)}` : fmtNum(n));

  if (!editing) {
    return (
      <button
        type="button"
        disabled={!props.canWrite}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="inline-flex items-baseline gap-1 rounded-chip border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors enabled:hover:border-transparent disabled:cursor-default"
        style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
        title={props.canWrite ? "Edit actual / target" : undefined}
      >
        <span className="font-bold text-ink-strong">{show(props.actual)}</span>
        <span className="font-bold text-ink-subtle">of</span>
        <span className="font-bold text-ink-strong">{show(props.target)}</span>
        {!props.rupee && props.uom && <span className="font-bold text-ink-subtle">{props.uom}</span>}
        {props.busy && <DelayedSpinner size={10} />}
      </button>
    );
  }

  /** "" → clear (null); invalid → keep the stored value; changed → commit. */
  const parse = (t: string): number | null | undefined => {
    const s = t.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const canEditTarget = props.canEditTarget ?? true;
  const commit = () => {
    setEditing(false);
    const nextAct = parse(actDraft);
    const nextTgt = parse(tgtDraft);
    if (nextAct !== undefined && nextAct !== props.actual) props.onCommitActual(nextAct);
    // Option A — a locked (cascaded) target never commits; the server rejects too.
    if (canEditTarget && nextTgt !== undefined && nextTgt !== props.target)
      props.onCommitTarget(nextTgt);
  };
  const sanitize = (v: string) => v.replace(/[^\d.]/g, "").slice(0, 14);
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5"
      style={{ borderColor: accentMix(45), background: accentMix(5) }}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        // Commit when focus leaves the whole pair (Tab between fields stays).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Act</span>
      <input
        ref={actRef}
        value={actDraft}
        inputMode="decimal"
        onChange={(e) => setActDraft(sanitize(e.target.value))}
        onKeyDown={keys}
        aria-label="Actual"
        className="w-14 bg-transparent text-[12px] font-bold tabular-nums text-ink-strong outline-none"
      />
      <span className="text-[11px] font-bold text-ink-subtle">of</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Tgt</span>
      <input
        value={tgtDraft}
        inputMode="decimal"
        disabled={!canEditTarget}
        title={canEditTarget ? undefined : POLICY_REASONS.cascadedTargets}
        onChange={(e) => setTgtDraft(sanitize(e.target.value))}
        onKeyDown={keys}
        aria-label="Target"
        className="w-14 bg-transparent text-[12px] font-bold tabular-nums text-ink-strong outline-none disabled:opacity-50"
      />
      {!props.rupee && props.uom && <span className="text-[11px] font-bold text-ink-subtle">{props.uom}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* "More" disclosure — line-2 right edge (§2.6): identity is read       */
/* constantly, progress is edited a few times a week — frequency earns  */
/* altitude, so the heavy instruments fold behind this.                 */
/* ------------------------------------------------------------------ */

function MoreToggle(props: { open: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        props.onToggle();
      }}
      aria-expanded={props.open}
      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-chip px-1.5 py-0.5 text-[11px] font-bold text-ink-faint transition-colors hover:text-ink-strong"
    >
      {props.open ? "Less" : "More"}
      <ChevronDown
        size={12}
        strokeWidth={2.6}
        className={`transition-transform duration-150 ${props.open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}

function MoreRegion(props: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion() ?? false;
  return (
    <AnimatePresence initial={false}>
      {props.open && (
        <motion.div
          key="more"
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: DUR.state, ease: EASE_OUT }}
          className="overflow-hidden"
        >
          {props.children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Progress controls — slider + 0/25/50/75/100 chips                   */
/* ------------------------------------------------------------------ */

export function PctControls(props: {
  pct: number;
  busy: boolean;
  onCommit: (n: number) => void;
  label: string;
}): React.JSX.Element {
  const [local, setLocal] = React.useState(props.pct);
  React.useEffect(() => setLocal(props.pct), [props.pct]);
  const tone = pctTone(local);
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={(e) => props.onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End")
            props.onCommit(Number((e.target as HTMLInputElement).value));
        }}
        aria-label={props.label}
        className="h-2 min-w-[110px] flex-1 cursor-pointer appearance-none rounded-full"
        style={{
          accentColor: tone.color,
          background: `linear-gradient(90deg, ${tone.color} ${local}%, var(--color-hairline-strong) ${local}%)`,
        }}
      />
      <span className="w-10 shrink-0 text-right text-[13px] font-bold tabular-nums" style={{ color: tone.color }}>
        {local}%
      </span>
      <span className="flex gap-1">
        {[0, 25, 50, 75, 100].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setLocal(n);
              props.onCommit(n);
            }}
            className="rounded-full border px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition-colors"
            style={
              local === n
                ? { background: tone.color, color: "#fff", borderColor: tone.color }
                : { color: "var(--color-ink-muted)", borderColor: "var(--color-hairline-strong)" }
            }
          >
            {n}
          </button>
        ))}
      </span>
      {props.busy && <DelayedSpinner size={12} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notes expander with dictation                                       */
/* ------------------------------------------------------------------ */

export function NotesBlock(props: {
  notes: string;
  canWrite: boolean;
  busy: boolean;
  onCommit: (t: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(!!props.notes.trim());
  const [draft, setDraft] = React.useState(props.notes);
  React.useEffect(() => {
    setDraft(props.notes);
    setOpen((o) => o || !!props.notes.trim());
  }, [props.notes]);
  const { listening, toggle } = useDictation();
  const dictate = () => {
    const base = draft.trim() ? draft.trim() + " " : "";
    toggle((s) => setDraft((base + s).slice(0, 2000)));
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ink-faint transition-colors hover:text-ink-strong"
      >
        <StickyNote size={12} strokeWidth={2.6} /> Add a note
      </button>
    );
  }
  return (
    <div
      className="flex items-start gap-2 rounded-xl border p-2"
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        value={draft}
        disabled={!props.canWrite}
        onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
        onBlur={() => {
          if (draft.trim() !== props.notes.trim()) props.onCommit(draft.trim());
        }}
        onKeyDown={(e) => e.stopPropagation()}
        rows={2}
        placeholder="Notes, blockers, context… or tap the mic to dictate"
        className="min-w-0 flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed text-ink-strong outline-none placeholder:text-ink-subtle"
      />
      {props.canWrite && <MicButton listening={listening} onClick={dictate} size={30} />}
      {props.busy && <DelayedSpinner size={12} className="mt-1 text-ink-muted" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Move to… — TRUE re-home across ALL FIVE levels (per-card; also the   */
/* KEYBOARD equivalent of the Phase-5 drag-to-sidebar/level-dock drop). */
/* Folded into the More region like the other heavy instruments: pick a */
/* target LEVEL (Year…Day) + a friendly-labeled BUCKET. Year/quarter/   */
/* month re-home in-table (moveGoalToLevel); WEEK/DAY cross tables via  */
/* moveGoalAcross (convert into weekly_goals / the day plan — ritual    */
/* stamps never fabricated), removing the card from this list instantly.*/
/* ------------------------------------------------------------------ */

const MOVE_LEVELS: ReadonlyArray<{ level: ZoomLevel; label: string }> = [
  { level: "year", label: "Year" },
  { level: "quarter", label: "Quarter" },
  { level: "month", label: "Month" },
  { level: "week", label: "Week" },
  { level: "day", label: "Day" },
];

/** Local "YYYY-MM-DD" (the Day bucket's default). */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function moveBucketsOf(level: ZoomLevel, fyStartYear: number): string[] {
  if (level === "year") return [String(fyStartYear)];
  if (level === "quarter") return quartersOfFy(fyStartYear);
  if (level === "month") return monthKeysOfFy(fyStartYear);
  if (level === "week") return fyWeeks(fyStartYear).map((w) => w.mondayISO);
  return []; // day — free date input, not a select
}

/** Friendly bucket copy for the select options + the success toast. */
function moveBucketLabel(level: ZoomLevel, key: string): string {
  if (level === "week") return `W${weekNoOf(key)} · ${weekRangeLabel(key)}`;
  if (level === "day") return key === todayKey() ? "today's plan" : `the ${key} plan`;
  return periodKeyLabel(key);
}

function MoveGoalControl(props: { g: GoalDTO }): React.JSX.Element {
  const { g } = props;
  const shell = useCanvasShell();
  const { mutation, fyStartYear, policy } = shell;
  // Option A — cross-level re-home is structure (admin/manager); the owner
  // keeps the same-level re-quarter, so the control stays mounted with the
  // other levels disabled-with-reason (the server enforces the same line).
  const canRehome = policy.canRehomeLevel;
  const [open, setOpen] = React.useState(false);
  const [level, setLevel] = React.useState<ZoomLevel>(g.period);
  const [key, setKey] = React.useState(g.periodKey);
  const [busy, setBusy] = React.useState(false);
  const levelRef = React.useRef<HTMLSelectElement>(null);
  React.useEffect(() => {
    if (open) levelRef.current?.focus();
  }, [open]);

  const buckets = moveBucketsOf(level, fyStartYear);
  const pickLevel = (lvl: ZoomLevel) => {
    if (!canRehome && lvl !== g.period) return; // belt + braces over the disabled option
    setLevel(lvl);
    if (lvl === "day") {
      setKey(todayKey());
      return;
    }
    const next = moveBucketsOf(lvl, fyStartYear);
    // Same-level → preselect where the goal already sits; week → the current
    // week when it's in range; else the first bucket.
    const preferred =
      lvl === g.period ? g.periodKey : lvl === "week" ? mondayKeyOf(new Date()) : null;
    setKey(preferred && next.includes(preferred) ? preferred : (next[0] ?? ""));
  };
  const keyShapeOk =
    level === "week" || level === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(key) : key.length > 0;
  const samePlace = level === g.period && key === g.periodKey;

  const commitMove = () => {
    if (samePlace || busy || !keyShapeOk) return;
    if (!canRehome && level !== g.period) return; // structure — server rejects too

    // WEEK/DAY — cross-table convert (Phase 5): the source row archives, so
    // the optimistic patch REMOVES the card; moveGoalAcross routes the write.
    if (level === "week" || level === "day") {
      setBusy(true);
      void mutation
        .mutate({ type: "remove", id: g.id }, () =>
          moveGoalAcross({ id: g.id, targetLevel: level, bucketKey: key }),
        )
        .then((ok) => {
          if (!ok) return; // mutate already toasted the error
          fireToast({ message: `Moved to ${moveBucketLabel(level, key)}`, type: "success" });
          setOpen(false);
        })
        .finally(() => setBusy(false));
      return;
    }

    // Mirror the server's re-parent rule so the card lands right INSTANTLY:
    // the same person's goal owning the parent bucket one level up (position-
    // first), else standalone — the returned row reconciles either way.
    const parentPeriod = level === "quarter" ? "year" : level === "month" ? "quarter" : null;
    const parentKey =
      level === "quarter"
        ? String(fyStartYearOfKey(key))
        : level === "month"
          ? quarterKeyOfMonthKey(key)
          : null;
    const parent =
      parentPeriod && parentKey
        ? (shell.goals
            .filter(
              (x) =>
                x.id !== g.id &&
                x.employeeId === g.employeeId &&
                x.period === parentPeriod &&
                x.periodKey === parentKey,
            )
            .sort((a, b) => a.position - b.position)[0] ?? null)
        : null;
    setBusy(true);
    void mutation
      .mutate(
        {
          type: "update",
          id: g.id,
          fields: { period: level, periodKey: key, parentGoalId: parent?.id ?? null, position: 9_999 },
        },
        () => moveGoalToLevel({ id: g.id, targetPeriod: level, targetPeriodKey: key }),
      )
      .then((ok) => {
        if (!ok) return; // mutate already toasted the error
        fireToast({ message: `Moved to ${periodKeyLabel(key)}`, type: "success" });
        setOpen(false);
      })
      .finally(() => setBusy(false));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setLevel(g.period);
          setKey(g.periodKey);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 self-start text-[11.5px] font-bold text-ink-faint transition-colors hover:text-ink-strong"
      >
        <ArrowRightLeft size={12} strokeWidth={2.6} /> Move to…
      </button>
    );
  }
  const selectCls =
    "rounded-lg border bg-transparent px-1.5 py-1 text-[11.5px] font-bold text-ink-muted outline-none";
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
      style={{ borderColor: accentMix(45), background: accentMix(5) }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
      }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
        Move to
      </span>
      <select
        ref={levelRef}
        value={level}
        disabled={busy}
        onChange={(e) => pickLevel(e.target.value as ZoomLevel)}
        aria-label="Target level"
        className={selectCls}
        style={{ borderColor: "var(--color-hairline-strong)" }}
      >
        {MOVE_LEVELS.map((l) => (
          <option
            key={l.level}
            value={l.level}
            // Option A — other levels are structure; disabled with the reason.
            disabled={!canRehome && l.level !== g.period}
            title={!canRehome && l.level !== g.period ? POLICY_REASONS.rehomeLevel : undefined}
          >
            {l.label}
          </option>
        ))}
      </select>
      {level === "day" ? (
        // Day — a full year of buckets doesn't fit a select; a date input is
        // the keyboard-first answer (defaults to today).
        <DateInput
          value={key}
          disabled={busy}
          onChange={setKey}
          ariaLabel="Target day"
          className={selectCls}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        />
      ) : (
        <select
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
          aria-label="Target period"
          className={selectCls}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          {buckets.map((b) => (
            <option key={b} value={b}>
              {moveBucketLabel(level, b)}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={commitMove}
        disabled={busy || samePlace || !keyShapeOk}
        className="inline-flex h-7 items-center gap-1 rounded-[9px] px-2.5 text-[12px] font-bold text-white disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        title={samePlace ? "Already there — pick a different bucket" : undefined}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
        Move
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Cancel move"
        className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-ink-subtle transition-colors hover:text-ink-strong"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {!canRehome && (
        // Same sentence the server would answer with — no promise the action refuses.
        <span className="w-full text-[11px] font-semibold text-ink-faint">
          {POLICY_REASONS.rehomeLevel} Same-level buckets stay open to you.
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GoalContainer — cascade rows (goals table)                          */
/* ------------------------------------------------------------------ */

export interface GoalContainerProps {
  g: GoalDTO;
  /** Direct siblings incl. the goal (parent's children) — contribution basis. */
  siblings: readonly GoalDTO[];
  parentTarget: number | null;
  /** Short parent label for the contribution chip — "Q2", "Jul". */
  parentShort: string;
  index: number;
  onDrill: () => void;
  /** True when the planner's roving keyboard selection sits on this card. */
  selected?: boolean;
  dragControls?: DragControls;
}

export function GoalContainer(props: GoalContainerProps): React.JSX.Element {
  const { g } = props;
  const shell = useCanvasShell();
  const { canWrite, mutation, policy } = shell;
  // Option A — a cascaded (auto-generated) goal's TARGET is plan structure:
  // admin/manager only. Actual/progress/notes stay the owner's.
  const canEditTarget = g.source !== "cascade" || policy.canEditCascadedTargets;
  const reduce = useReducedMotion() ?? false;
  const [now] = React.useState(() => new Date());

  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(
    (key: string, patch: GoalPatch, fn: () => Promise<{ ok: boolean; error?: string; row?: GoalDTO | null }>) => {
      setBusy(key);
      void mutation.mutate(patch, fn).finally(() => setBusy(null));
    },
    [mutation],
  );

  const eff = effectiveGoalPct(g);
  const tone = pctTone(eff);
  const h = deriveHealth(eff, g.periodKey, now, { spillover: isSpillover(g) });
  // §2.6 — the category chip left the card line (it lives on the left panel +
  // as a board lane); origin keeps the silent 3px left border.
  const origin = originStyle(g);
  const team = (g.teamInvolved ?? []) as TeamMember[];
  const [teamOpen, setTeamOpen] = React.useState(false);
  // §2.6 — the ops card is two lines; the heavy instruments fold behind More.
  const [more, setMore] = React.useState(false);

  // Measure basis: qty first (uom world), else ₹ amount.
  const qty = asNum(g.targetQty);
  const rupeeBasis = qty == null && asNum(g.targetAmount) != null;

  const commitTitle = (t: string) =>
    run(`title`, { type: "update", id: g.id, fields: { title: t } }, () => editGoal({ id: g.id, title: t }));
  const commitPct = (n: number) => {
    const next = clampPct(n);
    if (next === g.pctDone) return;
    run(`pct`, { type: "update", id: g.id, fields: { pctDone: next } }, () =>
      setGoalPctDone({ id: g.id, pctDone: next }),
    );
  };
  const commitMeasure = (field: "targetQty" | "actualQty" | "targetAmount" | "actualAmount") => (n: number | null) =>
    run(field, { type: "update", id: g.id, fields: { [field]: n == null ? null : n.toFixed(2) } }, () =>
      editGoal({ id: g.id, title: g.title, [field]: n }),
    );
  const commitNotes = (t: string) =>
    run(`notes`, { type: "update", id: g.id, fields: { notes: t } }, () =>
      editGoal({ id: g.id, title: g.title, notes: t }),
    );
  const commitTeam = (next: TeamMember[]) => {
    setTeamOpen(false);
    run(`team`, { type: "update", id: g.id, fields: { teamInvolved: next } }, () =>
      setGoalTeam({ id: g.id, team: next }),
    );
  };

  /* ---- THE card: TWO calm lines + a "More" disclosure (§2.6) ---- */
  return (
    <motion.article
      layout
      layoutId={`node-${g.id}`}
      transition={reduce ? { duration: 0 } : SPRING}
      data-goal-card={g.id}
      className="wg-rise rounded-xl border px-4 py-3"
      style={{
        borderColor: props.selected ? accentMix(55) : "var(--color-hairline)",
        borderLeft: `3px solid ${origin.color}`,
        background: `linear-gradient(135deg, ${h.bg} 0%, transparent 30%), var(--color-surface-card)`,
        boxShadow: props.selected
          ? `0 0 0 2px ${accentMix(35)}`
          : "0 1px 2px rgba(15,23,42,0.04)",
        animationDelay: `${Math.min(props.index, 8) * 55}ms`,
      }}
    >
      {/* line 1 — identity: grip · ring · code · title · eff% · drill */}
      <div className="flex items-center gap-2.5">
        {canWrite && props.dragControls && (
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => {
              e.preventDefault();
              props.dragControls?.start(e);
            }}
            className="shrink-0 cursor-grab text-ink-faint transition-colors hover:text-ink-strong active:cursor-grabbing"
          >
            <GripVertical size={14} strokeWidth={2.4} />
          </button>
        )}
        <Ring pct={eff} size={26} stroke={3} />
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-subtle" title={`${origin.label} · Sr ${g.position}`}>
          {goalCode(g)}
        </span>
        <div className="min-w-0 flex-1">
          <InlineTitle value={g.title} canWrite={canWrite} busy={busy === "title"} onCommit={commitTitle} strong />
        </div>
        <span
          className="w-12 shrink-0 text-right text-[16px] font-black tabular-nums"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: tone.color }}
        >
          <AnimatedNumber value={`${eff}%`} />
        </span>
        <button
          type="button"
          onClick={props.onDrill}
          aria-label={`Open ${g.title}`}
          className="group/drill inline-flex size-7 shrink-0 items-center justify-center rounded-lg border text-ink-subtle transition-colors hover:text-ink-strong"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <ChevronRight size={14} strokeWidth={2.6} className="transition-transform group-hover/drill:translate-x-0.5" />
        </button>
      </div>

      {/* line 2 — vitals: health · contribution · combined Tgt/Act · area · More */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <HealthChip h={h} />
        <ContributionBadge
          child={g}
          siblings={props.siblings}
          parentTarget={props.parentTarget}
          parentShort={props.parentShort}
        />
        <MeasurePairChip
          target={rupeeBasis ? asNum(g.targetAmount) : qty}
          actual={rupeeBasis ? asNum(g.actualAmount) : asNum(g.actualQty)}
          rupee={rupeeBasis}
          uom={g.uom}
          canWrite={canWrite}
          canEditTarget={canEditTarget}
          busy={busy != null && /^(target|actual)/.test(busy)}
          onCommitTarget={commitMeasure(rupeeBasis ? "targetAmount" : "targetQty")}
          onCommitActual={commitMeasure(rupeeBasis ? "actualAmount" : "actualQty")}
        />
        {g.area && <span className="text-[11.5px] font-semibold text-ink-subtle">{g.area}</span>}
        <MoreToggle open={more} onToggle={() => setMore((o) => !o)} />
      </div>

      {/* folded instruments (§2.6): slider + chips, notes, people. View-only
          write controls UNMOUNT (§2.7) — the spine pill is the one view-only
          treatment; the panel keeps the single ownership sentence. */}
      <MoreRegion open={more}>
        <div className="flex flex-col gap-2.5 pt-2.5">
          {isUnmeasured(g) && (
            <span
              className="self-start inline-flex items-center rounded-chip border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint"
              style={{ borderColor: "var(--color-hairline-strong)" }}
              title="No numeric target — excluded from the allocation math."
            >
              unmeasured
            </span>
          )}
          {canWrite && (
            <div>
              <PctControls pct={g.pctDone} busy={busy === "pct"} onCommit={commitPct} label={`Progress for ${g.title}`} />
              {g.acceptPct != null && (
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  manager-accepted {g.acceptPct}% overrides the self-rating
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <NotesBlock notes={g.notes ?? ""} canWrite={canWrite} busy={busy === "notes"} onCommit={commitNotes} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <TeamAvatarStack team={team} size={5} />
              {canWrite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTeamOpen((o) => !o);
                  }}
                  aria-expanded={teamOpen}
                  aria-label="Involve people"
                  className="inline-flex size-6 items-center justify-center rounded-full border text-ink-faint transition-colors hover:text-ink-strong"
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                >
                  <UserPlus size={12} strokeWidth={2.4} />
                </button>
              )}
              {busy === "team" && <DelayedSpinner size={12} />}
            </div>
          </div>
          {teamOpen && canWrite && (
            <TeamPicker roster={shell.roster} team={team} onDone={commitTeam} onCancel={() => setTeamOpen(false)} />
          )}
          {/* Re-home the goal — another quarter, or up/down a level (true move). */}
          {canWrite && <MoveGoalControl g={g} />}
        </div>
      </MoreRegion>
    </motion.article>
  );
}

/* ------------------------------------------------------------------ */
/* WeeklyGoalContainer — weekly rows (weekly_goals table)              */
/* ------------------------------------------------------------------ */

export interface WeeklyGoalContainerProps {
  w: WeeklyDTO;
  /** The week's SAME-PARENT siblings (contribution basis vs the month target —
   *  bug #13: never mix rows belonging to a different month goal). */
  siblings: readonly WeeklyDTO[];
  parentTarget: number | null;
  parentShort: string;
  /** bug #13 — a row with no month-goal linkage has no parent to contribute
   *  to: suppress the chip entirely (the sibling fallback would fabricate %). */
  hideContribution?: boolean;
  index: number;
}

export function WeeklyGoalContainer(props: WeeklyGoalContainerProps): React.JSX.Element {
  const { w } = props;
  const shell = useCanvasShell();
  const { canWrite, weeklyMutation } = shell;
  const reduce = useReducedMotion() ?? false;
  const [now] = React.useState(() => new Date());

  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(
    (
      key: string,
      fields: Partial<WeeklyDTO>,
      fn: Parameters<NonNullable<typeof weeklyMutation>["mutate"]>[1],
    ) => {
      if (!weeklyMutation) return;
      setBusy(key);
      void weeklyMutation.mutate({ type: "update", id: w.id, fields }, fn).finally(() => setBusy(null));
    },
    [weeklyMutation, w.id],
  );

  const eff = w.acceptPct ?? w.pctDone; // manual self-rating stays the record (locked decision 2)
  const tone = pctTone(eff);
  const h = deriveHealth(eff, w.weekStart, now, { spillover: w.spillover });
  const chipColor = w.spillover && eff < 100 ? RISK_RED : w.cascade ? "#1e3a8a" : "#111827";
  const qty = asNum(w.targetQty);
  const rupeeBasis = qty == null && asNum(w.targetAmount) != null;
  // §2.6 — same two-line treatment as the cascade ops card.
  const [more, setMore] = React.useState(false);

  const commitTitle = (t: string) => run("title", { title: t }, () => setWeeklyTitle({ id: w.id, title: t }));
  const commitPct = (n: number) => {
    const next = clampPct(n);
    if (next === w.pctDone) return;
    run("pct", { pctDone: next }, () => setCommitProgress({ id: w.id, pctDone: next }));
  };
  const commitMeasure = (field: "targetQty" | "actualQty" | "targetAmount" | "actualAmount") => (n: number | null) =>
    run(field, { [field]: n == null ? null : n.toFixed(2) }, () =>
      updateWeeklyCascadeFields({ id: w.id, [field]: n }),
    );
  const toggleAdopted = () =>
    run("adopted", { adopted: !w.adopted }, () => setWeeklyAdopted({ id: w.id, adopted: !w.adopted }));

  /* ---- THE weekly row: TWO calm lines + a "More" disclosure (§2.6) ---- */
  return (
    <motion.article
      layout
      layoutId={`wnode-${w.id}`}
      transition={reduce ? { duration: 0 } : SPRING}
      className="wg-rise rounded-xl border px-4 py-3"
      style={{
        borderColor: "var(--color-hairline)",
        borderLeft: `3px solid ${chipColor}`,
        background: `linear-gradient(135deg, ${h.bg} 0%, transparent 30%), var(--color-surface-card)`,
        animationDelay: `${Math.min(props.index, 8) * 45}ms`,
        opacity: w.adopted ? 1 : 0.6,
      }}
    >
      {/* line 1 — identity + the ritual's primary verb (Adopted stays here) */}
      <div className="flex items-center gap-2.5">
        <span
          className="shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white"
          style={{ background: chipColor }}
          title={w.spillover ? "Spillover — carried forward" : w.cascade ? "Cascaded from the month goal" : "Manual weekly goal"}
        >
          W{w.weekNo}
        </span>
        <Ring pct={eff} size={26} stroke={3} />
        <div className="min-w-0 flex-1">
          <InlineTitle value={w.title} canWrite={canWrite} busy={busy === "title"} onCommit={commitTitle} strong />
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={toggleAdopted}
            aria-pressed={w.adopted}
            className="inline-flex shrink-0 items-center gap-1 rounded-chip border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors"
            style={
              w.adopted
                ? { color: "#15803d", borderColor: "rgba(21,128,61,0.35)", background: "rgba(21,128,61,0.08)" }
                : { color: "var(--color-ink-faint)", borderColor: "var(--color-hairline-strong)" }
            }
            title={w.adopted ? "Adopted — counts toward the week" : "Dropped — excluded from the week"}
          >
            {w.adopted ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
            {w.adopted ? "Adopted" : "Dropped"}
            {busy === "adopted" && <DelayedSpinner size={10} className="text-current" />}
          </button>
        )}
        <span
          className="w-11 shrink-0 text-right text-[15px] font-black tabular-nums"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: tone.color }}
        >
          <AnimatedNumber value={`${eff}%`} />
        </span>
      </div>

      {/* line 2 — vitals: health · contribution · combined Tgt/Act · area · More */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <HealthChip h={h} />
        {!props.hideContribution && (
          <ContributionBadge
            child={w}
            siblings={props.siblings}
            parentTarget={props.parentTarget}
            parentShort={props.parentShort}
          />
        )}
        <MeasurePairChip
          target={rupeeBasis ? asNum(w.targetAmount) : qty}
          actual={rupeeBasis ? asNum(w.actualAmount) : asNum(w.actualQty)}
          rupee={rupeeBasis}
          uom={w.uom}
          canWrite={canWrite}
          busy={busy != null && /^(target|actual)/.test(busy)}
          onCommitTarget={commitMeasure(rupeeBasis ? "targetAmount" : "targetQty")}
          onCommitActual={commitMeasure(rupeeBasis ? "actualAmount" : "actualQty")}
        />
        {w.area && <span className="text-[11.5px] font-semibold text-ink-subtle">{w.area}</span>}
        {/* No dead affordance: view-only measured rows have nothing to fold. */}
        {(canWrite || isUnmeasured(w)) && <MoreToggle open={more} onToggle={() => setMore((o) => !o)} />}
      </div>

      {/* folded instruments — view-only write controls UNMOUNT (§2.7). */}
      <MoreRegion open={more && (canWrite || isUnmeasured(w))}>
        <div className="flex flex-col gap-2.5 pt-2.5">
          {isUnmeasured(w) && (
            <span
              className="self-start inline-flex items-center rounded-chip border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint"
              style={{ borderColor: "var(--color-hairline-strong)" }}
              title="Free-text target — excluded from the numeric rollup (self-rated % still counts)."
            >
              unmeasured
            </span>
          )}
          {canWrite && (
            <div>
              <PctControls pct={w.pctDone} busy={busy === "pct"} onCommit={commitPct} label={`Progress for ${w.title}`} />
              {w.acceptPct != null && (
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  manager-accepted {w.acceptPct}% overrides the self-rating
                </div>
              )}
            </div>
          )}
        </div>
      </MoreRegion>
    </motion.article>
  );
}

/* ------------------------------------------------------------------ */
/* QuickAdd — frictionless creation (collapsed → autofocus form + mic) */
/* ------------------------------------------------------------------ */

export function QuickAdd(props: {
  label: string;
  placeholder: string;
  onSubmit: (title: string) => Promise<boolean>;
  /** Optional bucket selector rendered inside the open form (e.g. month pick). */
  extra?: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { listening, toggle } = useDictation();
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commit = () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    void props
      .onSubmit(t)
      .then((ok) => {
        if (ok) setTitle("");
      })
      .finally(() => setBusy(false));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="wg-rise flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-[13px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
        style={{ borderColor: accentMix(40), background: accentMix(4) }}
      >
        <Plus className="h-4 w-4" style={{ color: ACCENT }} aria-hidden="true" />
        {props.label}
      </button>
    );
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
      style={{ borderColor: accentMix(45), background: accentMix(5) }}
    >
      <input
        ref={inputRef}
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value.slice(0, 400))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setTitle("");
          }
        }}
        aria-label={props.label}
        placeholder={props.placeholder}
        className="min-w-[160px] flex-1 bg-transparent text-[13px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
      />
      {props.extra}
      <MicButton
        listening={listening}
        onClick={() => {
          const base = title.trim() ? title.trim() + " " : "";
          toggle((s) => setTitle((base + s).slice(0, 400)));
        }}
        size={30}
      />
      <button
        type="button"
        onClick={commit}
        disabled={busy || title.trim().length === 0}
        className="inline-flex h-7 items-center gap-1 rounded-[9px] px-2.5 text-[12px] font-bold text-white disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Add
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTitle("");
        }}
        aria-label="Cancel quick add"
        className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-ink-subtle transition-colors hover:text-ink-strong"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
