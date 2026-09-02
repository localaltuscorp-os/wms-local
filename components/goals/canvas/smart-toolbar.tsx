"use client";

/**
 * Goals Canvas — SMART TOOLBAR (Unit: smart-toolbar.tsx).
 *
 * A horizontally-scrollable row of filter pills — SIMPLE TOGGLES in a fixed
 * order (§2.2: the old Reorder.Group drag was cosmetic state that reset on
 * reload and cost a confusing grab cursor) — that filter the already-loaded
 * goal set entirely CLIENT-side, plus the ONE real action: the New Goal
 * quick-add. The "Soon"-badged Import / AI / Views stubs are deleted (§1.7 —
 * ship nothing until it works). The active predicate is returned UP via
 * `onFilterChange` — this component never filters a list itself and never
 * fetches.
 *
 * HARD LAWS honoured (blueprint §0):
 *  - ZERO queries — pure derivation over the `goals` prop; the only server
 *    round-trip is the `createGoal` action, run through the shell's optimistic
 *    mutation spine (design §3.4): temp row shows instantly, reconciles with
 *    the returned server row — NO router.refresh().
 *  - Amber identity — brand-red is FORBIDDEN in components/goals/canvas/.
 *    Active pill = the goals gradient #E10600 → #A80400 (Altus red). Semantic reds:
 *    the semantic at-risk/spillover #b91c1c.
 *  - No CSS zoom/transform on ancestor wrappers; Motion layout springs only,
 *    all reduced-motion-gated. Keyboard-first (arrow keys walk the pills).
 */

import * as React from "react";
import { Loader2, Plus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { addChildGoal, createGoal } from "@/app/(app)/goals/cascade/actions";
import { addWeekGoal } from "@/app/(app)/goals/weekly/actions";
import { buildOptimisticGoal, type GoalMutationApi, type WeeklyMutationApi } from "./optimistic";
import { weekNoOf } from "./stage";
import {
  effectiveGoalPct,
  isSpillover,
  periodKeyLabel,
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
} from "@/components/goals/cascade/util";
import type { GoalPeriod } from "@/lib/goals/types";
import { deriveHealth } from "@/lib/goals/derive";
import type { GoalDTO, WeeklyDTO } from "./types";

/* ------------------------------------------------------------------ */
/* Quick-add target — a DISCRIMINATED union over the write surface.     */
/* On the goal surface (year/quarter) New-goal writes a goals-table row */
/* at the CHILD level — via addChildGoal when the focus provides a      */
/* parent, else a parentless createGoal (bug #7); on the WEEKS surface  */
/* (month/week/day) it writes a weekly_goals row via addWeekGoal —      */
/* never a stray month goal (bug #1). `buckets` are the SELECTABLE      */
/* sibling buckets of the child level (Q1–Q4 under a year, the 3 months */
/* of a quarter, the month's week Mondays) — when 2+ exist the expanded */
/* row shows a compact picker; `periodKey`/`weekStart` stays the        */
/* current-period DEFAULT.                                              */
/* ------------------------------------------------------------------ */
export interface QuickAddBucket {
  /** The write key — a periodKey ("2026-Q1"/"2026-07") or a week Monday ISO. */
  key: string;
  /** FRIENDLY label — "Q1" · "Apr" · "W27" (never the raw key). */
  label: string;
}

export type QuickAddTarget =
  | {
      kind: "goal";
      period: GoalPeriod;
      periodKey: string;
      parentGoalId: string | null;
      buckets?: QuickAddBucket[];
    }
  | { kind: "weekly"; weekStart: string; monthGoalId: string | null; buckets?: QuickAddBucket[] };

/* ------------------------------------------------------------------ */
/* Public filter contract                                              */
/* ------------------------------------------------------------------ */

/** Stable pill ids — area pills are namespaced `area:<name>`. */
export type GoalFilterId =
  | "all"
  | "mine"
  | "at-risk"
  | "delayed"
  | "completed"
  | `area:${string}`;

/** What the toolbar reports up whenever the active pill changes. */
export interface ActiveGoalFilter {
  id: GoalFilterId;
  label: string;
  /** Pure client-side predicate over the ALREADY-LOADED goal set. */
  predicate: (g: GoalDTO) => boolean;
}

export interface SmartToolbarProps {
  /** The loaded goal set (used ONLY to derive area pills + live counts). */
  goals: GoalDTO[];
  /** Person whose board is on screen — owner of a quick-added goal. */
  viewedEmployeeId: string;
  /**
   * The signed-in viewer (me.id, server-threaded — bug #15), for the "My
   * goals" pill (owned by me, or I'm on the team). The pill is HIDDEN when
   * this is absent or equals `viewedEmployeeId` (your own board — every goal
   * would trivially be "mine").
   */
  myEmployeeId?: string;
  /** Gates the New Goal quick-add (stubs render regardless). */
  canWrite: boolean;
  /** Bucket the quick-add writes into (current zoom bucket, per blueprint §7.4). */
  quickAddTarget: QuickAddTarget;
  /** Fired on mount and whenever the active pill (or the goal set) changes. */
  onFilterChange: (filter: ActiveGoalFilter) => void;
  /** The shell's optimistic mutation spine — quick-add goes through it (§3.4). */
  mutation: GoalMutationApi;
  /** The weekly optimistic spine — quick-add on the WEEKS surface routes here. */
  weeklyMutation: WeeklyMutationApi;
  /** Injected clock for deterministic pace math (defaults to render time). */
  now?: Date;
}

/* ------------------------------------------------------------------ */
/* Pace math — CANONICAL, lib/goals/derive.ts (§3.1; no local copies)  */
/* ------------------------------------------------------------------ */

/** At-risk per the spec's single fixed cut: behind pace by ≥25 pts. Spillover
 *  is deliberately EXCLUDED here — it powers the separate "Delayed" pill. */
function isAtRisk(g: GoalDTO, now: Date): boolean {
  return (
    deriveHealth(effectiveGoalPct(g), g.periodKey, now, { spillover: isSpillover(g) }).band ===
    "at-risk"
  );
}

/* ------------------------------------------------------------------ */
/* Pill model                                                          */
/* ------------------------------------------------------------------ */

interface Pill {
  id: GoalFilterId;
  label: string;
  /** Semantic dot colour (null = no dot, i.e. "All"). */
  dot: string | null;
  count: number;
  predicate: (g: GoalDTO) => boolean;
}

const DOT_MINE = GOALS_ACCENT; // #E10600 — Altus red identity
const DOT_AREA = "#1e3a8a"; //     origin blue (house value)
const DOT_RISK = "#b91c1c"; //     semantic at-risk red (house value)
const DOT_DONE = "#15803d"; //     house green

function buildPills(goals: GoalDTO[], myId: string | null, now: Date): Pill[] {
  const areas = [...new Set(goals.map((g) => g.area?.trim()).filter((a): a is string => !!a))].sort(
    (a, b) => a.localeCompare(b),
  );

  const defs: Array<Omit<Pill, "count">> = [
    { id: "all", label: "All", dot: null, predicate: () => true },
    ...areas.map((area) => ({
      id: `area:${area}` as const,
      label: area,
      dot: DOT_AREA,
      predicate: (g: GoalDTO) => g.area?.trim() === area,
    })),
    // bug #15 — only when the viewer ≠ the viewed person (null = hidden):
    // on your own board every goal is trivially "mine", and without the real
    // `myEmployeeId` the old fallback mislabeled subordinates' goals as yours.
    ...(myId
      ? [
          {
            id: "mine" as const,
            label: "My goals",
            dot: DOT_MINE,
            predicate: (g: GoalDTO) =>
              g.employeeId === myId || (g.teamInvolved ?? []).some((t) => t.employeeId === myId),
          },
        ]
      : []),
    { id: "at-risk", label: "At-risk", dot: DOT_RISK, predicate: (g) => isAtRisk(g, now) },
    { id: "delayed", label: "Delayed", dot: DOT_RISK, predicate: (g) => isSpillover(g) },
    { id: "completed", label: "Completed", dot: DOT_DONE, predicate: (g) => effectiveGoalPct(g) >= 100 },
  ];

  return defs.map((d) => ({ ...d, count: goals.filter(d.predicate).length }));
}

/* ------------------------------------------------------------------ */
/* Smart toolbar                                                       */
/* ------------------------------------------------------------------ */

export function SmartToolbar(props: SmartToolbarProps) {
  // Stable clock for pace math — one stamp per goal payload unless injected.
  const fallbackNow = React.useMemo(() => new Date(), [props.goals]);
  const now = props.now ?? fallbackNow;
  // bug #15 — the "My goals" pill exists only when the signed-in viewer is
  // threaded AND differs from the viewed person (no more viewedEmployeeId
  // fallback, which made the pill a mislabeled "All").
  const myId =
    props.myEmployeeId && props.myEmployeeId !== props.viewedEmployeeId
      ? props.myEmployeeId
      : null;

  const pills = React.useMemo(() => buildPills(props.goals, myId, now), [props.goals, myId, now]);

  /* ----- active pill + predicate publication ----- */
  const [active, setActive] = React.useState<GoalFilterId>("all");
  React.useEffect(() => {
    if (!pills.some((p) => p.id === active)) setActive("all");
  }, [pills, active]);

  const onFilterChangeRef = React.useRef(props.onFilterChange);
  React.useEffect(() => {
    onFilterChangeRef.current = props.onFilterChange;
  });
  React.useEffect(() => {
    const pill = pills.find((p) => p.id === active) ?? pills[0];
    if (pill) onFilterChangeRef.current({ id: pill.id, label: pill.label, predicate: pill.predicate });
  }, [pills, active]);

  /* ----- arrow-key walk across the pill row (keyboard-first) ----- */
  const rowRef = React.useRef<HTMLDivElement>(null);
  const onRowKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const row = rowRef.current;
    if (!row) return;
    const btns = Array.from(row.querySelectorAll<HTMLButtonElement>("button[data-pill]"));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    e.preventDefault();
    const next = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
    next?.focus();
    next?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  /* ----- New Goal quick-add (the ONLY write; blueprint §6.2 pattern) ----- */
  const [addOpen, setAddOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const addInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (addOpen) addInputRef.current?.focus();
  }, [addOpen]);

  /* ----- bucket picker: which sibling bucket the new goal lands in -----
     Candidates + the current-period default arrive on the target (built in
     goals-canvas.tsx); the select renders only with 2+ candidates — single/
     zero-bucket targets (yearly rootView year roots) keep the old behavior. */
  const tgtBuckets = props.quickAddTarget.buckets ?? [];
  const defaultBucket =
    props.quickAddTarget.kind === "weekly"
      ? props.quickAddTarget.weekStart
      : props.quickAddTarget.periodKey;
  // A pick is DERIVED state: it only holds while the target's default (its
  // identity) is unchanged AND it names a live candidate — otherwise the
  // current period's default wins. No sync effect needed.
  const [pick, setPick] = React.useState<{ base: string; key: string } | null>(null);
  const setBucketKey = (key: string) => setPick({ base: defaultBucket, key });
  const chosenBucket =
    pick && pick.base === defaultBucket && tgtBuckets.some((b) => b.key === pick.key)
      ? pick.key
      : defaultBucket;
  const chosenLabel = tgtBuckets.find((b) => b.key === chosenBucket)?.label ?? null;

  const commitAdd = React.useCallback(() => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const tgt = props.quickAddTarget;

    // WEEKS surface — write a weekly_goals row (never a stray month goal).
    // Optimistic temp lands in its week bucket instantly; reconciles on settle.
    if (tgt.kind === "weekly") {
      // The PICKED week Monday (defaults to the current period's week).
      const weekStart = chosenBucket;
      const temp: WeeklyDTO = {
        id: `optimistic-${crypto.randomUUID()}`,
        weekStart,
        monthKey: weekStart.slice(0, 7),
        weekNo: weekNoOf(weekStart),
        title: t,
        area: null,
        uom: null,
        pctDone: 0,
        acceptPct: null,
        position: 9_999,
        cascade: tgt.monthGoalId != null,
        spillover: false,
        targetQty: null,
        actualQty: null,
        targetAmount: null,
        actualAmount: null,
        weight: 100,
        adopted: true,
        monthGoalId: tgt.monthGoalId,
      };
      void props.weeklyMutation
        .mutate({ type: "insert", row: temp }, () =>
          addWeekGoal({
            employeeId: props.viewedEmployeeId,
            weekStart,
            title: t,
            monthGoalId: tgt.monthGoalId,
          }),
        )
        .then((ok) => {
          if (!ok) return;
          fireToast({ message: "Weekly goal added", type: "success" });
          setTitle("");
          setAddOpen(false);
        })
        .finally(() => setBusy(false));
      return;
    }

    // GOAL surface (year/quarter stages) — write a goals-table row at the CHILD
    // level (bug #7): under the focused parent via addChildGoal when one is on
    // screen (the row lands in the child planner's cascade list), else a
    // parentless createGoal into the same child bucket. The PICKED sibling
    // bucket (Q1–Q4 / the quarter's months) sets the periodKey — every
    // candidate is owned by the same focused parent, so parentId holds.
    const parentId = tgt.parentGoalId;
    const periodKey = chosenBucket;
    const temp = {
      ...buildOptimisticGoal({
        employeeId: props.viewedEmployeeId,
        period: tgt.period,
        periodKey,
        title: t,
      }),
      parentGoalId: parentId,
    };
    void props.mutation
      .mutate({ type: "insert", row: temp }, () =>
        parentId
          ? addChildGoal({ parentId, periodKey, title: t })
          : createGoal({
              employeeId: props.viewedEmployeeId,
              period: tgt.period,
              periodKey,
              title: t,
            }),
      )
      .then((ok) => {
        if (!ok) return; // mutate already toasted the error
        fireToast({ message: "Goal added", type: "success" });
        setTitle("");
        setAddOpen(false);
      })
      .finally(() => setBusy(false));
  }, [title, busy, chosenBucket, props.viewedEmployeeId, props.quickAddTarget, props.mutation, props.weeklyMutation]);

  return (
    <section
      aria-label="Smart toolbar"
      className="wg-rise flex items-center gap-3 rounded-section border px-3 py-2.5"
      style={{
        borderColor: "var(--color-hairline)",
        background: "var(--color-surface-card)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
    >
      {/* ---------- filter pills — simple toggles, fixed order (§2.2) ---------- */}
      <div
        ref={rowRef}
        role="toolbar"
        aria-label="Goal filters"
        onKeyDown={onRowKeyDown}
        className="min-w-0 flex-1 overflow-x-auto py-0.5"
        style={{
          scrollbarWidth: "none",
          maskImage:
            "linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent)",
        }}
      >
        <div className="flex w-max items-center gap-1.5 px-3.5">
          {pills.map((pill) => {
            const isActive = pill.id === active;
            return (
              <button
                key={pill.id}
                type="button"
                data-pill
                aria-pressed={isActive}
                onClick={() => setActive(pill.id)}
                className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold whitespace-nowrap transition-[background,color,border-color,box-shadow] duration-150"
                style={
                  isActive
                    ? {
                        color: "#ffffff",
                        border: "1px solid transparent",
                        background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`,
                        boxShadow: `0 8px 20px -10px color-mix(in srgb, ${GOALS_ACCENT_DEEP} 65%, transparent)`,
                      }
                    : {
                        color: "var(--color-ink-muted, #475569)",
                        borderColor: "var(--color-hairline-strong)",
                        background: "var(--color-surface-card)",
                      }
                }
              >
                {pill.dot ? (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: isActive ? "rgba(255,255,255,0.85)" : pill.dot }}
                  />
                ) : null}
                {pill.label}
                <span
                  className="rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums"
                  style={
                    isActive
                      ? { background: "rgba(255,255,255,0.18)", color: "#ffffff" }
                      : {
                          background: `color-mix(in srgb, ${GOALS_ACCENT} 8%, transparent)`,
                          color: "var(--color-ink-subtle)",
                        }
                  }
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- right cluster: the ONE real action ---------- */}
      <div className="flex shrink-0 items-center gap-1.5">
        {props.canWrite ? (
          addOpen ? (
            <div
              className="flex h-9 items-center gap-1 rounded-chip border pl-3 pr-1"
              style={{
                borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 45%, transparent)`,
                background: `color-mix(in srgb, ${GOALS_ACCENT} 5%, var(--color-surface-card))`,
              }}
            >
              <input
                ref={addInputRef}
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitAdd();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setAddOpen(false);
                    setTitle("");
                  }
                }}
                aria-label="New goal title"
                placeholder={
                  props.quickAddTarget.kind === "weekly"
                    ? `New weekly goal · ${chosenLabel ?? periodKeyLabel(props.quickAddTarget.weekStart.slice(0, 7))}…`
                    : `New goal · ${chosenLabel ?? periodKeyLabel(props.quickAddTarget.periodKey)}…`
                }
                className="w-52 bg-transparent text-[13px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle max-md:w-36"
              />
              {/* Bucket picker — WHICH sibling bucket (Q1–Q4 / month / week) the
                  goal lands in; hidden when there's nothing to choose. Friendly
                  labels only, defaulting to the current period's bucket. */}
              {tgtBuckets.length > 1 && (
                <select
                  value={chosenBucket}
                  disabled={busy}
                  onChange={(e) => setBucketKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setAddOpen(false);
                      setTitle("");
                    }
                  }}
                  aria-label="Target bucket for the new goal"
                  className="h-7 shrink-0 rounded-[9px] border bg-transparent px-1.5 text-[11.5px] font-bold text-ink-muted outline-none"
                  style={{ borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 35%, transparent)` }}
                >
                  {tgtBuckets.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={commitAdd}
                disabled={busy || title.trim().length === 0}
                aria-label="Add goal"
                className="inline-flex h-7 items-center gap-1 rounded-[9px] px-2.5 text-[12px] font-bold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setTitle("");
                }}
                aria-label="Cancel quick add"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-ink-subtle transition-colors hover:text-ink-strong"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="wg-sheen inline-flex h-9 items-center gap-1.5 rounded-chip px-3.5 text-[12.5px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`,
                boxShadow: `0 10px 24px -12px color-mix(in srgb, ${GOALS_ACCENT_DEEP} 70%, transparent)`,
              }}
            >
              <Plus className="h-4 w-4" />
              New Goal
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}
