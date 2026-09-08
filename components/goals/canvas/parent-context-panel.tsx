"use client";

/**
 * Goals Canvas — PARENT CONTEXT PANEL (Phase 3, the persistent LEFT — §2.2).
 *
 * Not an overlay: a persistent reference rail (~40% width on desktop, stacked
 * on mobile) that promotes the peek-panel content model to FIRST-CLASS and
 * makes it LIVE against the optimistic tree:
 *
 *   · identity — category · goalCode · period · origin · editorial title · area
 *   · alive progress — effective % (AnimatedNumber), TargetVsActual bars,
 *     ProgressDelta vs the prior period, the RollupProjection (a clearly
 *     LABELED projection — locked decision 1) and the health chip
 *   · structure — owner · timeline (periodBounds → days left)
 *   · inline editing — pct slider + chips, category, notes + mic, team
 *   · placeholder sections — linked entities / comments / activity (the
 *     collaboration phase fills these; honest "arrives later" stubs)
 *
 * Only Year has no full panel — it collapses to a slim FY summary (§2.2).
 * At Week zoom the subject is the week itself with the month goal as context.
 *
 * The hero card shares motion `layoutId` (`node-<id>`) with the GoalContainer
 * so drilling a child MORPHS it into this panel (§2.7).
 *
 * HARD LAWS: zero queries; amber identity; no CSS zoom/transform on ancestors.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQueryState, parseAsString } from "nuqs";
import {
  ArrowUp,
  CalendarRange,
  ChevronDown,
  Gauge,
  UserPlus,
  Users2,
} from "lucide-react";
import {
  categoryStyle,
  effectiveGoalPct,
  fmtNum,
  fyLabel,
  goalCode,
  isSpillover,
  originStyle,
  pctTone,
  periodKeyLabel,
  periodKeyShort,
  GOAL_CATEGORIES,
  type GoalCategory,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, DUR, EASE_OUT, SPRING, accentMix } from "./tokens";
import {
  asNum,
  deriveHealth,
  numericTarget,
  periodBounds,
  rollupPct,
  round2,
  rupeeRollup,
} from "@/lib/goals/derive";
import { editGoal, setGoalCategory, setGoalPctDone, setGoalTeam } from "@/app/(app)/goals/cascade/actions";
import { formatDate } from "@/lib/format";
import { AiInsightSection } from "./ai-insight";
import { AnimatedNumber, RollupProjection } from "./allocation";
import { CollabSections } from "./collab-panel";
import { ProgressDelta, TargetVsActual } from "./health";
import { DelayedSpinner, HealthChip, NotesBlock, PctControls, Ring } from "./goal-container";
import { TeamAvatarStack, TeamPicker, initialsOf, type TeamMember } from "./people";
import { useCanvasShell } from "./shell-context";
import { useCanvasStage } from "./stage";
import type { GoalPatch } from "./optimistic";

/* ------------------------------------------------------------------ */

/* Accent, ramp + spring come from the design contract (tokens.ts, §2.0). */

function SectionHeader({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
      {icon}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible section (§2.4 progressive disclosure)                    */
/* ------------------------------------------------------------------ */

/**
 * §2.4 — the left rail must never outweigh the work it contextualizes: only
 * Progress (+ the hero) stays permanently open; Owner/Timeline, Notes, People,
 * AI and Collab fold behind chevron headers, remembered per SESSION. `flush`
 * children (AI / Collab) carry their own section chrome + lazy fetches — kept
 * unmounted until opened, which also defers their loads.
 */
function Collapsible(props: {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  flush?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = React.useState(props.defaultOpen ?? false);
  // Read the remembered state AFTER mount so SSR and first client paint agree.
  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(`goals-panel:${props.id}`);
      if (saved != null) setOpen(saved === "1");
    } catch {
      /* storage unavailable — the default stands */
    }
  }, [props.id]);
  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        window.sessionStorage.setItem(`goals-panel:${props.id}`, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  return (
    <section className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <SectionHeader icon={props.icon}>{props.label}</SectionHeader>
        <ChevronDown
          size={14}
          strokeWidth={2.6}
          className={`shrink-0 text-ink-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: DUR.state, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            {props.flush ? props.children : <div className="px-5 pb-3.5">{props.children}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** lg breakpoint watcher (SSR-safe: the server snapshot says "wide"). */
function useNarrowViewport(): boolean {
  const subscribe = React.useCallback((cb: () => void) => {
    const mq = window.matchMedia("(max-width: 1023px)");
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, []);
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
}

/** "Jul 1 → Sep 30 · 42 days left" from a periodKey. */
function timelineOf(periodKey: string, now: Date): { label: string; leftLabel: string; elapsedPct: number } {
  const { start, end } = periodBounds(periodKey);
  const fmt = (d: Date) => formatDate(d);
  const endShown = new Date(end.getTime() - 86_400_000); // inclusive end
  const total = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  const leftLabel =
    now.getTime() >= end.getTime()
      ? "period closed"
      : now.getTime() < start.getTime()
        ? "not started"
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  return {
    label: `${fmt(start)} → ${fmt(endShown)}`,
    leftLabel,
    elapsedPct: total > 0 ? Math.round((elapsed / total) * 100) : 100,
  };
}

/* ------------------------------------------------------------------ */
/* Slim FY summary (Year zoom — §2.2: the objective IS the canvas)     */
/* ------------------------------------------------------------------ */

function SlimFySummary(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const goals = shell.filteredGoals;

  // bug #6 — ROOT objectives only: the cascade writes the same progress at
  // every level, so counting/averaging all rows inflates one divided objective
  // into "17 adopted · ~4%". rollupPct skips non-adopted roots internally.
  const roots = React.useMemo(() => goals.filter((g) => g.parentGoalId == null), [goals]);
  const adopted = React.useMemo(() => roots.filter((g) => g.adopted), [roots]);
  const attain = rollupPct(roots) ?? 0;
  const tone = pctTone(attain);

  // bug #20 — walk EVERY parentless root, not just year-level rows (a planner
  // whose plan starts at quarters has no year row, so `period === "year"`
  // skipped everything → no ₹ line at all); totals are round2-ed so the 2-dp
  // money strings never show float drift.
  const rupee = React.useMemo(() => {
    let target = 0;
    let actual = 0;
    let has = false;
    for (const g of roots) {
      const r = rupeeRollup(g, (n) => stage.maps.childrenOf.get(n.id) ?? []);
      if (r) {
        has = true;
        target += r.target;
        actual += r.actual;
      }
    }
    return has ? { target: round2(target), actual: round2(actual) } : null;
  }, [roots, stage.maps]);

  return (
    <aside
      className="wg-rise rounded-section border p-5"
      style={{
        borderColor: "var(--color-hairline)",
        background: `linear-gradient(160deg, ${accentMix(7)}, transparent 55%), var(--color-surface-card)`,
        boxShadow: "0 16px 40px -30px rgba(15,23,42,0.28)",
      }}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: ACCENT_DEEP }}>
        {fyLabel(shell.fyStartYear)}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative shrink-0">
          <Ring pct={attain} size={72} stroke={7} />
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-[17px] font-black tabular-nums" style={{ color: tone.color, fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              <AnimatedNumber value={String(attain)} />
              <span className="text-[11px]">%</span>
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink-strong">
            <span className="tabular-nums">{adopted.length}</span> adopted goal{adopted.length === 1 ? "" : "s"}
          </div>
          <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
            Weighted attainment · labeled projection
          </div>
          {rupee && (
            <div className="mt-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
              ₹{fmtNum(rupee.actual)}{" "}
              <span className="font-bold text-ink-subtle">of ₹{fmtNum(rupee.target)}</span>
            </div>
          )}
        </div>
      </div>
      <p
        className="mt-4 border-t pt-3 text-[13px] italic leading-relaxed text-ink-muted"
        style={{ borderColor: "var(--color-hairline)", fontFamily: "var(--font-serif), Georgia, serif" }}
      >
        At Year the objective is the canvas - drill a quarter on the right to
        open its full context here.
      </p>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Week context (Week/Day zoom)                                        */
/* ------------------------------------------------------------------ */

function WeekContext(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const week = stage.week;
  const monthGoal = stage.weekParent;

  if (!week) return <SlimFySummary />;

  // `allRows` — the rollup is a math/basis read; the toolbar filter now hides
  // weekly rows too (bug #16) and must never change the projected numbers.
  const roll =
    rollupPct(
      week.allRows.map((r) => ({ pctDone: r.pctDone, acceptPct: r.acceptPct, weight: r.weight, adopted: r.adopted })),
    ) ?? 0;
  const tone = pctTone(roll);
  const t = timelineOf(week.weekStart, stage.now);

  return (
    <aside
      className="flex flex-col rounded-section border lg:sticky lg:top-4"
      style={{
        borderColor: "var(--color-hairline)",
        background: "var(--color-surface-card)",
        boxShadow: "0 16px 40px -30px rgba(15,23,42,0.28)",
      }}
    >
      <motion.div layoutId={`week-${week.weekStart}`} transition={SPRING} className="px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-chip px-2 py-1 text-[12px] font-bold tabular-nums text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            W{week.weekNo}
          </span>
          {week.isCurrent && (
            <span className="rounded-chip px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: ACCENT_DEEP, background: accentMix(10) }}>
              this week
            </span>
          )}
        </div>
        <h2
          className="mt-2 text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {week.rangeLabel}
        </h2>
        {monthGoal && (
          <button
            type="button"
            onClick={() => shell.zoom.focusNode(monthGoal.id, "month")}
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-chip px-2 py-0.5 text-[11.5px] font-bold transition-colors hover:text-ink-strong"
            style={{ color: ACCENT_DEEP, background: accentMix(8) }}
            title="Back to the month context"
          >
            <ArrowUp size={11} strokeWidth={2.6} />
            <span className="truncate">{goalCode(monthGoal)} · {monthGoal.title}</span>
          </button>
        )}
      </motion.div>

      <section className="px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <SectionHeader>Week rollup · self-rated</SectionHeader>
          <span
            className="tabular-nums"
            style={{ color: tone.color, fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: "-0.02em" }}
          >
            <AnimatedNumber value={String(roll)} />
            <span className="text-[14px]">%</span>
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: accentMix(10) }}>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${roll}%`, background: tone.color }} />
        </div>
        <p className="mt-2 text-[12px] font-semibold text-ink-subtle">
          Weighted over the {week.allRows.filter((r) => r.adopted).length} adopted goal
          {week.allRows.filter((r) => r.adopted).length === 1 ? "" : "s"} this week - a projection; each
          goal keeps its own recorded %.
        </p>
      </section>

      <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
        <SectionHeader icon={<CalendarRange size={12} strokeWidth={2.6} />}>Timeline</SectionHeader>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-ink-strong">{t.label}</span>
          <span className="text-[11.5px] font-bold tabular-nums" style={{ color: ACCENT_DEEP }}>
            {t.leftLabel}
          </span>
        </div>
      </section>

      {/* Ritual state judges the WHOLE week's rows, filter or not (bug #16). */}
      <RitualStateSection rows={week.allRows} isCurrent={week.isCurrent} />
      {/* Phase 7 — the week has no entity of its own; the collaboration thread
          lives on the OWNING month goal (the week's parent context).
          §2.4: folded by default (shared remembered state with the goal panel). */}
      {monthGoal && (
        <Collapsible id="collab" flush label="Review · collaboration">
          <CollabSections
            node={{ kind: "cascade", id: monthGoal.id }}
            contextLabel={`${goalCode(monthGoal)} · month thread`}
          />
        </Collapsible>
      )}
      <div className="h-2" />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Ritual state (Phase 6, §2.2/§2.6) — committed / awaiting approval    */
/* ------------------------------------------------------------------ */

/**
 * The week's ritual position, derived from the DISPLAY-ONLY stamp mirrors the
 * page payload carries (`committed` = committed_at, `approved` =
 * approved_by_manager_at — the punch gates keep reading the real columns
 * server-side). "Open the ritual" deep-links into the RitualBanner's
 * `?ritual=commit` state — the same state /goals/commit aliases to.
 */
function RitualStateSection(props: {
  rows: import("./types").WeeklyDTO[];
  isCurrent: boolean;
}): React.JSX.Element {
  const [, setRitual] = useQueryState("ritual", parseAsString);
  const adopted = props.rows.filter((r) => r.adopted);
  const known = adopted.length > 0 && adopted.every((r) => r.committed !== undefined);
  const committed = known && adopted.every((r) => r.committed);
  const approved =
    known && adopted.every((r) => r.approved !== undefined && r.approved);

  const state =
    adopted.length === 0
      ? { label: "No adopted goals this week", tone: "var(--color-ink-faint, #94a3b8)", bg: "transparent" }
      : !known
        ? { label: "Ritual state unavailable", tone: "var(--color-ink-faint, #94a3b8)", bg: "transparent" }
        : approved
          ? { label: "Approved by manager", tone: "#15803d", bg: "color-mix(in srgb, #15803d 10%, transparent)" }
          : committed
            ? { label: "Committed · awaiting Monday approval", tone: ACCENT_DEEP, bg: accentMix(10) }
            : { label: "Not committed - freeze at the Saturday commit", tone: ACCENT_DEEP, bg: accentMix(10) };

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader icon={<Gauge size={12} strokeWidth={2.6} />}>Ritual state</SectionHeader>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span
          className="rounded-chip px-2 py-1 text-[11.5px] font-bold"
          style={{ color: state.tone, background: state.bg }}
        >
          {state.label}
        </span>
        <button
          type="button"
          onClick={() => void setRitual("commit")}
          className="ml-auto rounded-chip px-2 py-1 text-[11.5px] font-bold transition-colors hover:text-ink-strong"
          style={{ color: ACCENT_DEEP, background: accentMix(8) }}
          title="Open the Saturday commit ritual inline (same state /goals/commit deep-links to)"
        >
          Open the ritual →
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Full goal panel (Quarter / Month zoom)                              */
/* ------------------------------------------------------------------ */

function GoalPanel({ g }: { g: GoalDTO }): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { canWrite, mutation } = shell;
  const reduce = useReducedMotion() ?? false;

  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(
    (key: string, patch: GoalPatch, fn: () => Promise<{ ok: boolean; error?: string; row?: GoalDTO | null }>) => {
      setBusy(key);
      void mutation.mutate(patch, fn).finally(() => setBusy(null));
    },
    [mutation],
  );

  const [catOpen, setCatOpen] = React.useState(false);
  const [teamOpen, setTeamOpen] = React.useState(false);
  React.useEffect(() => {
    setCatOpen(false);
    setTeamOpen(false);
  }, [g.id]);

  const eff = effectiveGoalPct(g);
  const tone = pctTone(eff);
  const h = deriveHealth(eff, g.periodKey, stage.now, { spillover: isSpillover(g) });
  const cat = categoryStyle(g.category, isSpillover(g));
  const origin = originStyle(g);
  const team = (g.teamInvolved ?? []) as TeamMember[];
  const t = timelineOf(g.periodKey, stage.now);

  /* ---- live rollup: cascade children at quarter; weekly rows at month ---- */
  const children = stage.maps.childrenOf.get(g.id) ?? [];
  // Scope to THIS month goal's own weekly rows (bug #13) — two goals can share
  // a calendar month, and weeklyByMonth is keyed only by monthKey.
  const monthWeekly =
    g.period === "month"
      ? (stage.maps.weeklyByMonth.get(g.periodKey) ?? []).filter((r) => r.monthGoalId === g.id)
      : [];
  const childRollup =
    g.period === "month"
      ? rollupPct(monthWeekly.map((r) => ({ pctDone: r.pctDone, acceptPct: r.acceptPct, weight: r.weight, adopted: r.adopted })))
      : rollupPct(children);

  /* ---- ProgressDelta vs the immediately-previous sibling period ---- */
  const lastPct = React.useMemo<number | null>(() => {
    const pool = shell.goals.filter(
      (x) => x.period === g.period && x.parentGoalId === g.parentGoalId && x.periodKey < g.periodKey,
    );
    if (pool.length === 0) return null;
    const prevKey = pool.reduce((max, x) => (x.periodKey > max ? x.periodKey : max), pool[0]!.periodKey);
    const prev = pool.filter((x) => x.periodKey === prevKey);
    if (prev.length === 0) return null;
    return Math.round(prev.reduce((s, x) => s + effectiveGoalPct(x), 0) / prev.length);
  }, [shell.goals, g.period, g.parentGoalId, g.periodKey]);

  /* ---- target-vs-actual pair (qty first, ₹ fallback) ---- */
  const qty = asNum(g.targetQty);
  const rupeeBasis = qty == null && asNum(g.targetAmount) != null;
  const tvaTarget = rupeeBasis ? asNum(g.targetAmount) : qty;
  const tvaActual = rupeeBasis ? asNum(g.actualAmount) : asNum(g.actualQty);

  const commitPct = (n: number) => {
    const next = Math.max(0, Math.min(100, Math.round(n)));
    if (next === g.pctDone) return;
    run("pct", { type: "update", id: g.id, fields: { pctDone: next } }, () =>
      setGoalPctDone({ id: g.id, pctDone: next }),
    );
  };
  const commitCategory = (c: GoalCategory) => {
    setCatOpen(false);
    if (c === g.category) return;
    run("cat", { type: "update", id: g.id, fields: { category: c } }, () =>
      setGoalCategory({ id: g.id, category: c }),
    );
  };
  const commitNotes = (txt: string) =>
    run("notes", { type: "update", id: g.id, fields: { notes: txt } }, () =>
      editGoal({ id: g.id, title: g.title, notes: txt }),
    );
  const commitTeam = (next: TeamMember[]) => {
    setTeamOpen(false);
    run("team", { type: "update", id: g.id, fields: { teamInvolved: next } }, () =>
      setGoalTeam({ id: g.id, team: next }),
    );
  };

  const paceSentence =
    h.band === "done"
      ? "Complete - nothing left to chase."
      : h.delta === 0
        ? `Exactly on the ${periodKeyShort(g.periodKey)} pace.`
        : h.delta > 0
          ? `${h.delta} pts ahead of the ${periodKeyShort(g.periodKey)} pace.`
          : `${Math.abs(h.delta)} pts behind the ${periodKeyShort(g.periodKey)} pace.`;

  return (
    <aside
      className="flex flex-col rounded-section border lg:sticky lg:top-4"
      style={{
        borderColor: "var(--color-hairline)",
        background: "var(--color-surface-card)",
        boxShadow: "0 16px 40px -30px rgba(15,23,42,0.28)",
      }}
      aria-label={`Context for ${g.title}`}
    >
      {/* ── Hero (shared layoutId — the drilled child MORPHS into this) ── */}
      <motion.div
        layoutId={`node-${g.id}`}
        transition={reduce ? { duration: 0 } : SPRING}
        className="px-5 pt-4"
        style={{ borderLeft: `3px solid ${origin.color}`, marginLeft: -1, borderTopLeftRadius: 16 }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => setCatOpen((o) => !o)}
            aria-expanded={catOpen}
            className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide disabled:cursor-default"
            style={{ color: cat.color, background: cat.bg }}
          >
            {cat.label}
          </button>
          <span className="text-[11px] font-bold tabular-nums text-ink-subtle">{goalCode(g)}</span>
          <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-ink-muted" style={{ background: "var(--color-surface-soft)" }}>
            {periodKeyLabel(g.periodKey)}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: origin.color }}>
            {origin.label}
          </span>
          {busy === "cat" && <DelayedSpinner size={12} />}
        </div>
        {catOpen && canWrite && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {GOAL_CATEGORIES.map((c) => {
              const cs = categoryStyle(c, false);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => commitCategory(c)}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase"
                  style={{ color: cs.color, background: cs.bg, outline: g.category === c ? `1px solid ${cs.color}` : "none" }}
                >
                  {cs.label}
                </button>
              );
            })}
          </div>
        )}
        <h2
          className="mt-1.5 leading-[1.12] text-ink-strong"
          style={{
            overflowWrap: "anywhere",
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(19px, 1.8vw, 24px)",
            letterSpacing: "-0.02em",
          }}
        >
          {g.title}
        </h2>
        {g.area && (
          <span
            className="mt-1.5 inline-block rounded-chip px-2 py-0.5 text-[11px] font-bold"
            style={{ color: ACCENT_DEEP, background: accentMix(10) }}
          >
            {g.area}
          </span>
        )}
      </motion.div>

      {/* ── Alive progress ── */}
      <section className="px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <SectionHeader>Progress · recorded</SectionHeader>
          <div className="text-right leading-none">
            <span
              className="tabular-nums"
              style={{ color: tone.color, fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.02em" }}
            >
              <AnimatedNumber value={String(eff)} />
              <span className="text-[15px]">%</span>
            </span>
            {g.acceptPct != null && (
              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                manager-accepted
              </div>
            )}
          </div>
        </div>

        <ProgressDelta pct={eff} lastPct={lastPct} className="mt-2.5" />
        {(tvaTarget != null || tvaActual != null) && (
          <TargetVsActual
            target={tvaTarget}
            actual={tvaActual}
            uom={rupeeBasis ? "₹" : g.uom}
            className="mt-3.5"
          />
        )}

        {/* The derived rollup — ALWAYS a labeled projection, never "the" % */}
        <div className="mt-3">
          <RollupProjection rollup={childRollup} recorded={eff} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <HealthChip h={h} />
          <span className="text-[12px] font-semibold text-ink-muted">{paceSentence}</span>
        </div>
        {isSpillover(g) && (
          <p className="mt-2 rounded-xl px-3 py-2 text-[12px] font-semibold" style={{ color: "#b91c1c", background: "rgba(185,28,28,0.10)" }}>
            Carried forward from an earlier period and not yet closed.
          </p>
        )}

        {canWrite ? (
          <div className="mt-3.5">
            <PctControls pct={g.pctDone} busy={busy === "pct"} onCommit={commitPct} label={`Progress for ${g.title}`} />
          </div>
        ) : (
          <p className="mt-2.5 text-[12px] font-semibold text-ink-subtle">
            View-only - this objective is owned by {shell.viewedName}.
          </p>
        )}
      </section>

      {/* ── Owner · timeline (§2.4: collapsible, default OPEN) ── */}
      <Collapsible id="timeline" defaultOpen label="Owner · timeline" icon={<CalendarRange size={12} strokeWidth={2.6} />}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {initialsOf(shell.viewedName)}
            </span>
            <span className="text-[12.5px] font-bold text-ink-strong">{shell.viewedName}</span>
          </span>
          <span className="text-[12.5px] font-bold tabular-nums text-ink-strong">
            {t.label}{" "}
            <span className="font-bold" style={{ color: ACCENT_DEEP }}>
              · {t.leftLabel}
            </span>
          </span>
          {numericTarget(g) == null && (
            <span
              className="rounded-chip border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              unmeasured
            </span>
          )}
        </div>
        {/* period elapsed strip */}
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full" style={{ background: accentMix(10) }}>
          <div className="h-full rounded-full" style={{ width: `${t.elapsedPct}%`, background: ACCENT }} />
        </div>
      </Collapsible>

      {/* ── Notes (§2.4: collapsible) ── */}
      <Collapsible id="notes" label="Notes">
        <NotesBlock notes={g.notes ?? ""} canWrite={canWrite} busy={busy === "notes"} onCommit={commitNotes} />
      </Collapsible>

      {/* ── People (§2.4: collapsible) ── */}
      <Collapsible id="people" label="People" icon={<Users2 size={12} strokeWidth={2.6} />}>
        <div className="flex flex-wrap items-center gap-2">
          <TeamAvatarStack team={team} />
          {team.length > 0 && (
            <span className="text-[12px] font-semibold text-ink-muted">
              {team.length} involved
              {g.teamDependencyPct != null && <span className="tabular-nums"> · {g.teamDependencyPct}% dependent</span>}
            </span>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => setTeamOpen((o) => !o)}
              aria-expanded={teamOpen}
              className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              <UserPlus size={13} strokeWidth={2.4} /> {team.length > 0 ? "Edit" : "Involve people"}
            </button>
          )}
          {busy === "team" && <DelayedSpinner size={12} />}
        </div>
        {teamOpen && canWrite && (
          <TeamPicker roster={shell.roster} team={team} onDone={commitTeam} onCancel={() => setTeamOpen(false)} />
        )}
      </Collapsible>

      {/* Phase 8 — the AI health-narrative line (§2.2): cache-only read,
          generated in the background off the read path (ai-insight.tsx).
          §2.4: folded by default; opening it is what mounts (and fetches) it. */}
      <Collapsible id="ai" flush label="AI read">
        <AiInsightSection g={g} />
      </Collapsible>

      {/* Phase 7 — review scorecard + linked entities + evidence + comments +
          activity, lazy-loaded once per goal and cached (collab-panel.tsx).
          §2.4: folded by default — the lazy load now waits for the open. */}
      <Collapsible id="collab" flush label="Review · collaboration">
        <CollabSections node={{ kind: "cascade", id: g.id }} scorecardGoal={g} />
      </Collapsible>
      <div className="h-2" />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* ParentContextPanel — the exported LEFT rail                         */
/* ------------------------------------------------------------------ */

export function ParentContextPanel(): React.JSX.Element {
  const stage = useCanvasStage();
  const narrow = useNarrowViewport();
  const [expanded, setExpanded] = React.useState(false);
  const isWeek = stage.z === "week" || stage.z === "day";
  // Collapse the mobile strip whenever the subject changes.
  const subjectKey = isWeek ? (stage.week?.weekStart ?? "") : (stage.focus?.id ?? "");
  React.useEffect(() => setExpanded(false), [subjectKey]);

  // ?q front door — a quarter-addressed deep link (/goals/quarterly?q=Q2)
  // scopes the LEFT rail to THAT quarter's goal; the slim FY summary otherwise.
  if (stage.z === "year")
    return stage.addressedChild ? <GoalPanel g={stage.addressedChild} /> : <SlimFySummary />;
  const full: React.JSX.Element = isWeek ? (
    <WeekContext />
  ) : stage.focus ? (
    <GoalPanel g={stage.focus} />
  ) : (
    <SlimFySummary />
  );
  if (!narrow) return full;

  /* §2.4 — below lg the context rail collapses to a tappable SUMMARY STRIP
     (identity · % · health) so the planner leads; tap expands the full panel.
     The strip carries no layoutId — the drill morph is a desktop story. */
  let summary: React.ReactNode = null;
  if (isWeek && stage.week) {
    const week = stage.week;
    const roll =
      rollupPct(
        week.allRows.map((r) => ({ pctDone: r.pctDone, acceptPct: r.acceptPct, weight: r.weight, adopted: r.adopted })),
      ) ?? 0;
    summary = (
      <>
        <span
          className="shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          W{week.weekNo}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-strong">{week.rangeLabel}</span>
        <span className="shrink-0 text-[14px] font-black tabular-nums" style={{ color: pctTone(roll).color }}>
          {roll}%
        </span>
      </>
    );
  } else if (stage.focus) {
    const g = stage.focus;
    const eff = effectiveGoalPct(g);
    const h = deriveHealth(eff, g.periodKey, stage.now, { spillover: isSpillover(g) });
    summary = (
      <>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-subtle">{goalCode(g)}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-strong">{g.title}</span>
        <HealthChip h={h} />
        <span className="shrink-0 text-[14px] font-black tabular-nums" style={{ color: pctTone(eff).color }}>
          {eff}%
        </span>
      </>
    );
  } else {
    return full; // nothing to summarize — the slim card is already compact
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
        className="wg-rise flex w-full items-center gap-2.5 rounded-section border px-4 py-3 text-left"
        style={{
          borderColor: "var(--color-hairline)",
          background: "var(--color-surface-card)",
          boxShadow: "0 10px 30px -24px rgba(15,23,42,0.35)",
        }}
      >
        {summary}
        <ChevronDown
          size={16}
          strokeWidth={2.6}
          className={`shrink-0 text-ink-faint transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {expanded && full}
    </div>
  );
}
