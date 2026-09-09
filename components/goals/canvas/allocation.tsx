"use client";

/**
 * Goals Canvas — REAL-TIME ALLOCATION UI (Phase 2, design §3.2 — the Quarter
 * proof). Everything here is PURE client derivation over the already-loaded FY
 * tree via lib/goals/derive.ts — zero DB queries per keystroke.
 *
 * Three atoms + one banner:
 *   <AnimatedNumber/>     — a tabular-nums number that VISIBLY animates
 *                           (kpiNumberIn) to its new value the instant an
 *                           optimistic edit lands, before the server confirms.
 *   <ContributionBadge/>  — a child card's live share of the parent target
 *                           (derive.contributionPct; unmeasured rows render as
 *                           "unmeasured" and are excluded — locked decision 3).
 *   <RollupProjection/>   — the parent's live child-rollup as a clearly-LABELED
 *                           PROJECTION next to the recorded (manual) % — the
 *                           rollup is NEVER written into pctDone/acceptPct
 *                           (locked decision 1; gates/PDF/scoring read those
 *                           columns directly).
 *   <AllocationBanner/>   — slides in when Σ(child targets) ≠ parent target
 *                           (derive.allocation): "Children total 118% of the
 *                           AQ2 target. Rebalance ▸" → per-card diff preview
 *                           (derive.suggestDistribution, largest-remainder) →
 *                           Apply commits atomically via redistributeChildren
 *                           (the module's first db.transaction) through the
 *                           shell's optimistic spine.
 *
 * HARD LAWS (blueprint §0): amber identity — brand-red FORBIDDEN; the only red
 * is the semantic over-allocation #b91c1c. No CSS zoom/transform on ancestors.
 * All motion reduced-motion-gated. Keyboard-first (buttons, Esc closes preview).
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Loader2, Scale, X } from "lucide-react";

import {
  allocation,
  asNum,
  contributionPct,
  isUnmeasured,
  numericTarget,
  round2,
  type AllocationChild,
} from "@/lib/goals/derive";
import {
  fmtNum,
  goalCode,
  periodKeyShort,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, SPRING, accentMix, SEM_RISK } from "./tokens";
import { POLICY_REASONS } from "@/lib/goals/policy";
import { redistributeChildren } from "@/app/(app)/goals/cascade/actions";
import type { GoalMutationApi } from "./optimistic";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/* Accent, ramp + spring come from the design contract (tokens.ts, §2.0). */
const OVER_RED = SEM_RISK; // semantic only — over-allocated

/* ------------------------------------------------------------------ */
/* AnimatedNumber — the number visibly moves on release                */
/* ------------------------------------------------------------------ */

/**
 * Re-mounts (key = rendered text) so `kpiNumberIn` replays whenever the value
 * changes — the premium "number visibly animates to its new value" feedback
 * (design §2.7). Reduced-motion users get an instant swap.
 */
export function AnimatedNumber(props: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const reduce = useReducedMotion() ?? false;
  return (
    <span
      key={props.value}
      className={`inline-block tabular-nums ${props.className ?? ""}`}
      style={{
        ...(reduce
          ? undefined
          : { animation: "kpiNumberIn 420ms cubic-bezier(.2,.8,.2,1) backwards" }),
        ...props.style,
      }}
    >
      {props.value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ContributionBadge — a child's live share of the parent target       */
/* ------------------------------------------------------------------ */

export function ContributionBadge(props: {
  child: AllocationChild;
  siblings: readonly AllocationChild[];
  parentTarget: number | null;
  /** Short parent label for the chip — e.g. "Q2". */
  parentShort: string;
}): React.JSX.Element | null {
  if (isUnmeasured(props.child)) {
    return (
      <span
        className="inline-flex items-center rounded-chip border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-ink-faint"
        style={{ borderColor: "var(--color-hairline-strong)" }}
        title="No numeric target on this goal — excluded from the allocation math."
      >
        unmeasured
      </span>
    );
  }
  const pct = contributionPct(props.child, props.siblings, props.parentTarget);
  if (pct == null) return null;
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-chip px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]"
      style={{ color: ACCENT_DEEP, background: accentMix(10) }}
      title={`This goal's target is ${pct}% of the ${props.parentShort} target — recomputed live as siblings change.`}
    >
      <AnimatedNumber value={`${pct}%`} />
      <span className="font-bold normal-case tracking-normal text-ink-subtle">of {props.parentShort}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* RollupProjection — a LABELED projection, never "the" number         */
/* ------------------------------------------------------------------ */

/**
 * Locked decision 1 made visible: the derived child-rollup is shown side by
 * side with the RECORDED % (the manual pctDone/acceptPct that punch gates, the
 * Sunday PDF and scoring actually read) and explicitly labeled a projection.
 */
export function RollupProjection(props: {
  /** derive.rollupPct over the children — null = no adopted children. */
  rollup: number | null;
  /** The recorded effective % (acceptPct ?? pctDone) — the column of record. */
  recorded: number;
}): React.JSX.Element | null {
  if (props.rollup == null) return null;
  const agree = props.rollup === props.recorded;
  return (
    <div
      className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-chip border px-2.5 py-1"
      style={{ borderColor: accentMix(30), background: accentMix(6) }}
      title="Live rollup = weighted attainment derived from the child goals. It is a display-only projection — the recorded % below is what reports and gates read, and it is never overwritten."
    >
      <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: ACCENT_DEEP }}>
        Live rollup
      </span>
      <AnimatedNumber
        value={`${props.rollup}%`}
        className="text-[15px] font-black"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          color: ACCENT_DEEP,
          letterSpacing: "-0.01em",
        }}
      />
      <span className="text-[11px] font-bold text-ink-subtle">
        {agree ? "matches" : "vs"} recorded <span className="tabular-nums">{props.recorded}%</span>
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">projection</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AllocationBanner — over/under chip + rebalance preview + commit     */
/* ------------------------------------------------------------------ */

interface PreviewRow {
  child: GoalDTO;
  current: number;
  next: number;
  delta: number;
}

export function AllocationBanner(props: {
  parent: GoalDTO;
  /** The parent's DIRECT children (position-sorted; the objective list).
   *  Named `childGoals` (not `children`) — React reserves that prop. */
  childGoals: GoalDTO[];
  canWrite: boolean;
  /** Option A (Phase 2) — applying a rebalance is STRUCTURE (admin/manager);
   *  false renders the Rebalance CTA disabled-with-reason (the over/under
   *  diagnosis stays visible to the owner). Optional, default true. */
  canRebalance?: boolean;
  mutation: GoalMutationApi;
}): React.JSX.Element | null {
  const reduce = useReducedMotion() ?? false;
  const mayRebalance = props.canWrite && (props.canRebalance ?? true);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const parentShort = periodKeyShort(props.parent.periodKey);
  const parentTarget = numericTarget(props.parent);
  // Pure client derivation — recomputes on every optimistic tree change.
  const alloc = React.useMemo(
    () => allocation(props.childGoals, parentTarget),
    [props.childGoals, parentTarget],
  );

  // Close the preview whenever the gap resolves (optimistic apply → 'exact').
  const active = alloc != null && alloc.state !== "exact";
  React.useEffect(() => {
    if (!active) setPreviewOpen(false);
  }, [active]);

  const preview = React.useMemo<PreviewRow[]>(() => {
    if (!alloc?.suggestion) return [];
    const rows: PreviewRow[] = [];
    for (const child of props.childGoals) {
      const next = alloc.suggestion.get(child.id);
      if (next == null) continue;
      const current = numericTarget(child) ?? 0;
      rows.push({ child, current, next, delta: round2(next - current) });
    }
    return rows;
  }, [alloc, props.childGoals]);

  const apply = React.useCallback(() => {
    if (!alloc?.suggestion || busy || !mayRebalance) return; // Option A — server rejects too
    const updates = preview.map(({ child, next }) => {
      // Write to the column carrying the child's numeric basis — qty first,
      // else ₹ amount (same rule the server re-derives in redistributeChildren).
      const qtyBasis = (asNum(child.targetQty) ?? 0) > 0;
      return {
        id: child.id,
        fields: qtyBasis
          ? { targetQty: next.toFixed(2) }
          : { targetAmount: next.toFixed(2) },
      };
    });
    const distribution = preview.map(({ child, next }) => ({ id: child.id, target: next }));
    setBusy(true);
    void props.mutation
      .mutate({ type: "updateMany", updates }, () =>
        redistributeChildren({ parentId: props.parent.id, distribution }),
      )
      .finally(() => setBusy(false));
    // The numbers animate to their new values immediately (optimistic tree →
    // AnimatedNumber remounts); the banner slides out as allocation → 'exact'.
  }, [alloc, busy, mayRebalance, preview, props.mutation, props.parent.id]);

  const over = alloc?.state === "over";
  const pctOfParent =
    alloc && parentTarget != null && parentTarget > 0
      ? Math.round((alloc.sum / parentTarget) * 100)
      : null;

  return (
    <AnimatePresence initial={false}>
      {active && alloc && (
        <motion.section
          key="allocation-banner"
          aria-label="Allocation check"
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduce ? { duration: 0 } : SPRING}
          className="overflow-hidden rounded-section border"
          style={{
            borderColor: over ? "rgba(185,28,28,0.35)" : accentMix(40),
            background: over
              ? "linear-gradient(135deg, rgba(185,28,28,0.06), transparent 60%), var(--color-surface-card)"
              : `linear-gradient(135deg, ${accentMix(8)}, transparent 60%), var(--color-surface-card)`,
          }}
        >
          {/* ── The corrective chip line ── */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-chip"
              style={{ background: over ? OVER_RED : ACCENT }}
            >
              <Scale className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink-strong">
              Children total{" "}
              <AnimatedNumber
                value={fmtNum(alloc.sum)}
                className="font-black"
                style={{ color: over ? OVER_RED : ACCENT_DEEP }}
              />
              {pctOfParent != null && (
                <>
                  {" "}
                  —{" "}
                  <AnimatedNumber
                    value={`${pctOfParent}%`}
                    className="font-black"
                    style={{ color: over ? OVER_RED : ACCENT_DEEP }}
                  />
                </>
              )}{" "}
              of the {parentShort} target of{" "}
              <span className="font-black tabular-nums">{fmtNum(parentTarget)}</span>
              <span
                className="ml-2 inline-flex items-center rounded-chip px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]"
                style={{
                  color: over ? OVER_RED : ACCENT_DEEP,
                  background: over ? "rgba(185,28,28,0.10)" : accentMix(12),
                }}
              >
                {over ? "▲ over" : "▼ under"} by{" "}
                <AnimatedNumber value={fmtNum(Math.abs(alloc.delta))} className="ml-1" />
              </span>
            </p>
            {props.canWrite && alloc.suggestion && (
              // Option A — the CTA is structure: disabled-with-reason for owners
              // (the diagnosis above stays; the server enforces the same line).
              <button
                type="button"
                onClick={() => setPreviewOpen((o) => !o)}
                disabled={!mayRebalance}
                title={mayRebalance ? undefined : POLICY_REASONS.rebalance}
                aria-expanded={previewOpen}
                className="inline-flex shrink-0 items-center gap-1 rounded-chip px-3 py-1.5 text-[12px] font-black text-white transition-transform duration-150 enabled:hover:-translate-y-0.5 disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                Rebalance
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* ── Per-card diff preview (before commit) ── */}
          <AnimatePresence initial={false}>
            {previewOpen && preview.length > 0 && (
              <motion.div
                key="preview"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={reduce ? { duration: 0 } : SPRING}
                className="overflow-hidden"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setPreviewOpen(false);
                  }
                }}
              >
                <div className="border-t px-4 py-3" style={{ borderColor: "var(--color-hairline)" }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                      Proportional rebalance — largest remainder, sums exactly to{" "}
                      <span className="tabular-nums">{fmtNum(parentTarget)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(false)}
                      aria-label="Close rebalance preview"
                      className="inline-flex size-6 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
                    >
                      <X size={13} strokeWidth={2.6} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {preview.map(({ child, current, next, delta }) => (
                      <div
                        key={child.id}
                        className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
                        style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
                      >
                        <span className="w-[46px] shrink-0 text-[10px] font-black tabular-nums text-ink-subtle">
                          {goalCode(child)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-strong">
                          {child.title}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-1.5 text-[13px] tabular-nums">
                          <span className="font-bold text-ink-subtle line-through decoration-1">
                            {fmtNum(current)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-ink-faint" aria-hidden="true" />
                          <span className="font-black" style={{ color: ACCENT_DEEP }}>
                            {fmtNum(next)}
                          </span>
                        </span>
                        <span
                          className="w-[64px] shrink-0 text-right text-[11px] font-black tabular-nums"
                          style={{ color: delta > 0 ? "#15803d" : delta < 0 ? OVER_RED : "var(--color-ink-faint)" }}
                        >
                          {delta > 0 ? `+${fmtNum(delta)}` : delta < 0 ? `−${fmtNum(Math.abs(delta))}` : "±0"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(false)}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink-strong"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={apply}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-black text-white transition-transform duration-150 enabled:hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                    >
                      {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      Apply Rebalance
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
