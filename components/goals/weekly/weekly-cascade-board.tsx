"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Target,
  CheckCircle2,
  BadgeCheck,
  ClipboardList,
  Snowflake,
  Plus,
  Loader2,
  Check,
  List,
  Columns3,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { motion } from "motion/react";
import { fireToast } from "@/lib/toast";
import { addWeekGoal } from "@/app/(app)/goals/weekly/actions";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { ViewingSelect } from "@/components/goals/shared/viewing-select";
import { WeekSelect, formatWeekRangeShort } from "./week-select";
import { TeamWeightsField, type TeamMemberWeight } from "@/components/goals/board/team-weights-field";
import { CascadeGoalCard } from "./cascade-goal-card";
import { GoalTableView, ALL_VISIBLE_COLS, QUARTER_TYPE_OPTIONS } from "@/components/goals/board/goal-table-view";
import { WEEKLY_TABLE_ACTIONS } from "@/components/goals/board/weekly-table-actions";
import { CommitDialog } from "@/components/goals/commit/commit-dialog";
import type { CommitMember } from "@/components/goals/commit/types";
import { effectiveGoalPct, type GoalDTO } from "@/components/goals/cascade/util";
import { WeeklyKanban } from "./weekly-kanban";
import { WeeklyDashboard } from "./weekly-dashboard";
import {
  GoalStatChip,
  MultiPickFilter,
  ColumnsPicker,
  SORT_OPTIONS,
  statusBand,
  csvCell,
  useColOrder,
  type SortKey,
} from "@/components/goals/board/goals-level-board";
import { GOAL_TYPE_LABELS, type GoalType } from "@/db/enums";
import type { BoardMe, CascadeWeeklyGoal, MonthGoalOption, RosterMember } from "./types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** localStorage key for the weekly board's List ⇄ Kanban preference. */
const WEEKLY_VIEW_STORE_KEY = "goals-weekly-view";

/** Map a weekly cascade row onto the shared inline table's GoalDTO shape.
 *  `nameOf` resolves the creator's display name from the loaded roster so an
 *  assigned weekly goal shows "Assigned by …" (load-neutral). */
function weeklyToGoalDTO(
  g: CascadeWeeklyGoal,
  nameOf?: (id: string | null) => string | null,
): GoalDTO {
  return {
    id: g.id,
    employeeId: g.employeeId,
    createdById: g.createdById,
    createdAt: g.createdAt,
    createdByName: g.createdById ? nameOf?.(g.createdById) ?? null : null,
    period: "week",
    periodKey: g.weekStart,
    parentGoalId: g.monthGoalId ?? null,
    position: g.position,
    area: g.area,
    title: (g.targetDone ?? "").trim() || (g.subject ?? "").trim() || "Untitled",
    uom: g.uom,
    targetQty: g.targetQty,
    actualQty: g.actualQty,
    targetAmount: g.targetAmount,
    actualAmount: g.actualAmount,
    notes: null,
    teamInvolved: g.teamInvolved?.map((m) => ({ employeeId: m.employeeId, name: m.name })) ?? null,
    teamDependencyPct: g.teamDependencyPct,
    pctDone: g.pctDone,
    acceptPct: g.acceptPct,
    reviewNotes: null,
    evidenceUrl: g.evidenceUrl,
    weight: g.weight,
    adopted: g.adopted,
    source: "manual",
    category: "goal",
    // Column parity with Y/Q/M — the shared table's Type/Status/Reviewer/Share/
    // Delegated columns read + edit these real weekly_goals fields.
    goalType: g.goalType ?? null,
    status: g.status ?? null,
    reviewedById: g.reviewedById ?? null,
    delegatedTo: g.delegatedTo ?? null,
    clonedFromId: g.carriedFromId ?? null,
    incentiveEnabled: false,
    incentiveAmount: null,
    incentiveKind: null,
    monthlyMasterRef: null,
    shareWithTeam: g.shareWithTeam ?? false,
    targetDate: g.targetDate ?? null,
  };
}

// Goals module identity (amber-gold). Read from the `--goals-accent` token when
// present, else fall back to the module-theme hex. Kept as CSS-var strings so the
// whole surface themes automatically if the root token lands.
const ACCENT = "var(--goals-accent, #E10600)";
const ACCENT_DEEP = "var(--goals-accent-deep, #A80400)";
const ACCENT_TINT = "color-mix(in srgb, var(--goals-accent, #E10600) 12%, transparent)";

/**
 * The Goals-workspace Weekly board (client shell). Week-nav labels weeks
 * **W1..W52** (FY calendar) with the Mon–Sun range; a person picker (admins /
 * managers) drills into a downline member; each row renders the cascade card
 * (monthly linkage + adopt + new fields + team + carry-forward). A "carry all
 * unfinished forward" action clones every incomplete goal into next week (the
 * opt-in auto-forward ritual).
 */
export function WeeklyCascadeBoard({
  me,
  weekStart,
  weekNo,
  weekLabel,
  thisWeek,
  scopeEmp,
  canPickPerson,
  people,
  rows,
  dayGoals,
  roster,
  monthGoalOptions,
  areaOptions,
  measureOptions,
  typeOptions,
  customLookups,
  fyStartYear,
  commit,
}: {
  me: BoardMe;
  weekStart: string;
  weekNo: number;
  weekLabel: string;
  /** The LIVE week's Monday — the pivot the week popover's list is built around
   *  (and the week the page defaults to when the URL carries no `?week=`). */
  thisWeek: string;
  scopeEmp: string;
  canPickPerson: boolean;
  people: { id: string; name: string }[];
  rows: CascadeWeeklyGoal[];
  /** Day goals (goals table, period="day") whose date falls in this week — the
   *  Week→Day kanban's day-lane cards. */
  dayGoals: GoalDTO[];
  roster: RosterMember[];
  monthGoalOptions: MonthGoalOption[];
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  customLookups: { areas: string[]; measures: string[]; types: string[] };
  fyStartYear: number;
  /** Self "freeze next week" ritual, surfaced as a popup (null when not self). */
  commit: { member: CommitMember; nextWeekLabel: string; weekStart: string } | null;
}) {
  const router = useRouter();
  const [commitOpen, setCommitOpen] = React.useState(false);

  // Full screen — the same toggle the Yearly/Quarterly/Monthly boards use.
  const [fullscreen, setFullscreen] = React.useState(false);
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Resolve a creator id → name from the loaded roster (load-neutral) so an
  // assigned weekly goal reads "Assigned by …".
  const nameById = React.useMemo(() => new Map(roster.map((r) => [r.id, r.name] as const)), [roster]);
  const nameOf = React.useCallback(
    (id: string | null) => (id ? nameById.get(id) ?? null : null),
    [nameById],
  );
  const quickAddRef = React.useRef<WeeklyQuickAddHandle>(null);

  // ── View: classic list ⇄ Kanban (persisted). SSR renders "list"; the stored
  //    preference applies after mount so hydration stays clean. ─────────
  const [view, setView] = React.useState<"list" | "kanban" | "dashboard">("list");
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WEEKLY_VIEW_STORE_KEY);
      if (stored === "kanban" || stored === "dashboard") setView(stored);
    } catch {
      /* storage unavailable — stay on list */
    }
  }, []);
  const pickView = React.useCallback((v: "list" | "kanban" | "dashboard") => {
    setView(v);
    try {
      window.localStorage.setItem(WEEKLY_VIEW_STORE_KEY, v);
    } catch {
      /* non-fatal */
    }
  }, []);
  // Who may create a weekly goal here: self, an admin, or a manager viewing a
  // downline member (the server re-asserts this on addWeekGoal).
  const canWrite = me.isAdmin || scopeEmp === me.id || canPickPerson;

  function goWeek(w: string) {
    const params = new URLSearchParams();
    params.set("week", w);
    if (scopeEmp !== me.id) params.set("emp", scopeEmp);
    router.push(`/goals/weekly?${params.toString()}`);
  }

  function goPerson(emp: string) {
    const params = new URLSearchParams();
    params.set("week", weekStart);
    if (emp !== me.id) params.set("emp", emp);
    router.push(`/goals/weekly?${params.toString()}`);
  }

  const adopted = rows.filter((r) => r.adopted);
  const dropped = rows.filter((r) => !r.adopted);

  // GoalDTO projection of the adopted goals — the filters, sort, export and
  // the table itself all operate on this shape, same as the Yearly/Quarterly/
  // Monthly boards.
  const adoptedGoals = React.useMemo(() => adopted.map((g) => weeklyToGoalDTO(g, nameOf)), [adopted, nameOf]);

  const goalTypeLabel = React.useCallback(
    (g: GoalDTO) => (g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""),
    [],
  );

  // Header stat chips — the same Total/Done/On track/Behind read the Yearly/
  // Quarterly/Monthly boards use, computed over the adopted (not crossed-out)
  // goals for this week. Clicking one narrows the LIST view the same way.
  const [completion, setCompletion] = React.useState<"all" | "done" | "ontrack" | "behind">("all");
  const chipCounts = React.useMemo(() => {
    let done = 0;
    let ontrack = 0;
    let behind = 0;
    for (const g of adoptedGoals) {
      const p = effectiveGoalPct(g);
      if (p >= 100) done++;
      else if (p >= 50) ontrack++;
      else behind++;
    }
    return { all: adoptedGoals.length, done, ontrack, behind };
  }, [adoptedGoals]);

  // Sort · Area · Type filters, Rows-per-page + Columns — the SAME toolbar
  // controls the Yearly/Quarterly/Monthly boards have.
  const [sortKey, setSortKey] = React.useState<SortKey>("position");
  const [areaFilter, setAreaFilter] = React.useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = React.useState<Set<string>>(new Set());
  const [rowsPerPage, setRowsPerPage] = React.useState<number | "all">(25);
  const [visibleCols, setVisibleCols] = React.useState<Set<string>>(() => new Set(ALL_VISIBLE_COLS));
  const [colOrder, setColOrder] = useColOrder();

  // Area dropdown options: the managed lookup set FIRST, then any area found
  // on an existing goal that isn't already listed.
  const areaFilterOptions = React.useMemo(() => {
    const seen = new Set(areaOptions.map((a) => a.toLowerCase()));
    const extra = [...new Set(adoptedGoals.map((g) => g.area).filter((a): a is string => !!a))]
      .filter((a) => !seen.has(a.toLowerCase()))
      .sort();
    return [...areaOptions, ...extra];
  }, [areaOptions, adoptedGoals]);

  const filterGoal = React.useCallback(
    (g: GoalDTO) => {
      if (completion !== "all") {
        const p = effectiveGoalPct(g);
        if (completion === "behind" && p >= 50) return false;
        if (completion === "ontrack" && (p < 50 || p >= 100)) return false;
        if (completion === "done" && p < 100) return false;
      }
      if (areaFilter.size > 0 && !areaFilter.has(g.area ?? "")) return false;
      if (typeFilter.size > 0 && !typeFilter.has(goalTypeLabel(g))) return false;
      return true;
    },
    [completion, areaFilter, typeFilter, goalTypeLabel],
  );

  // Sort comparator — mirrors the level boards' (Sr. No. / Score /
  // At-risk / A→Z).
  const sortCmp = React.useCallback(
    (a: GoalDTO, b: GoalDTO): number => {
      const posTie = a.position - b.position || a.title.localeCompare(b.title);
      switch (sortKey) {
        case "score-desc":
          return effectiveGoalPct(b) - effectiveGoalPct(a) || posTie;
        case "score-asc":
          return effectiveGoalPct(a) - effectiveGoalPct(b) || posTie;
        case "risk":
          return (
            statusBand(effectiveGoalPct(a)) - statusBand(effectiveGoalPct(b)) ||
            effectiveGoalPct(a) - effectiveGoalPct(b) ||
            posTie
          );
        case "az":
          return a.title.localeCompare(b.title) || posTie;
        default:
          return 0; // "position" — already Sr.-No. ordered
      }
    },
    [sortKey],
  );

  const displayed = React.useMemo(() => {
    const list = adoptedGoals.filter(filterGoal);
    return sortKey === "position" ? list : [...list].sort(sortCmp);
  }, [adoptedGoals, filterGoal, sortKey, sortCmp]);

  const pagedGoals = React.useMemo(
    () => (rowsPerPage === "all" ? displayed : displayed.slice(0, rowsPerPage)),
    [displayed, rowsPerPage],
  );

  // ── Export the CURRENTLY-VISIBLE goals to CSV (client-side Blob) ──────
  const exportCsv = React.useCallback(() => {
    const header = ["Sr", "Goal", "Area", "% done", "Status"];
    const body = displayed.map((g, i) => {
      const pct = effectiveGoalPct(g);
      const status = pct >= 100 ? "Done" : pct >= 50 ? "On track" : "At risk";
      return [String(i + 1), g.title, g.area ?? "", String(pct), status];
    });
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Weekly-Goals-W${weekNo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [displayed, weekNo]);

  // Ritual state IN CONTEXT — mirrors of committed_at / approved_by_manager_at
  // (the pages own the logic; these chips only read the stamps + deep-link).
  const committedCount = adopted.filter((r) => r.committed).length;
  const approvedCount = adopted.filter((r) => r.approvedByManager).length;

  // Whose board — self vs. a downline member (drives the header eyebrow +
  // the "VIEWING" avatar pill). people[] is empty when the picker is hidden,
  // so fall back to the first row's employeeName, then a neutral label.
  const isSelf = scopeEmp === me.id;
  const viewedName =
    people.find((p) => p.id === scopeEmp)?.name ?? rows[0]?.employeeName ?? (isSelf ? "My goals" : "Teammate");

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-auto bg-surface-soft px-7 pt-4 pb-10 max-md:px-4 max-md:pt-3"
          : "relative mx-auto w-full min-w-0 max-w-[1560px] px-7 pt-4 pb-16 max-md:px-4 max-md:pt-3"
      }
      style={{ color: "var(--color-ink-strong)" }}
    >
      {/* ── HEADER — the SAME Tasks-page treatment as Yearly/Quarterly/Monthly:
          a slim title+stat-chip header, then a compact glass-strip control row
          for Week / Viewing. ── */}
      <header className="wg-rise relative mb-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap min-w-0">
          <h1
            className="text-ink-strong shrink-0"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(20px, 1.8vw, 25px)",
              letterSpacing: "-0.028em",
              lineHeight: 1,
            }}
          >
            Weekly Goals
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <GoalStatChip
              label="Total"
              value={chipCounts.all}
              tone="slate"
              active={completion === "all"}
              onClick={() => setCompletion("all")}
            />
            <GoalStatChip
              label="Done"
              value={chipCounts.done}
              tone="green"
              active={completion === "done"}
              onClick={() => setCompletion(completion === "done" ? "all" : "done")}
            />
            <GoalStatChip
              label="On track"
              value={chipCounts.ontrack}
              tone="amber"
              active={completion === "ontrack"}
              onClick={() => setCompletion(completion === "ontrack" ? "all" : "ontrack")}
            />
            <GoalStatChip
              label="Behind"
              value={chipCounts.behind}
              tone="red"
              active={completion === "behind"}
              onClick={() => setCompletion(completion === "behind" ? "all" : "behind")}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            className={`inline-flex shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all cursor-pointer ${FOCUS_RING}`}
          >
            {fullscreen ? <Minimize2 size={14} strokeWidth={2.4} /> : <Maximize2 size={14} strokeWidth={2.4} />}
            {fullscreen ? "Exit" : "Full screen"}
          </button>
        </div>
      </header>

      <div
        className="wg-rise mb-3 flex items-center gap-2 flex-wrap rounded-section border border-hairline px-3 py-2 max-md:px-3"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
        }}
      >
        {/* Week selector + Add Goal + the person picker, all grouped on the
            RIGHT: ..... [ W19 · 10 Aug – 16 Aug ▾ ] [ + Add Goal ] [ Viewing ]. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <WeekSelect value={weekStart} thisWeek={thisWeek} onPick={goWeek} />

          <button
            type="button"
            onClick={() => quickAddRef.current?.open()}
            className={`pastel-cta wg-btn inline-flex shrink-0 items-center gap-1.5 h-9 rounded-pill px-3.5 text-[13px] font-bold transition-all hover:-translate-y-px cursor-pointer ${FOCUS_RING}`}
          >
            <Plus size={14} strokeWidth={2.8} />
            Add Goal
          </button>

          {canPickPerson && people.length > 0 && (
            <ViewingSelect
              people={people}
              value={scopeEmp}
              viewedName={viewedName}
              onChange={(v) => goPerson(v)}
              myEmployeeId={me.id}
            />
          )}
        </div>
      </div>

      {/* ── Feature toolbar — view toggle · ritual chips · Sort · Areas ·
          Types · Rows · Columns · Export · Bulk upload, ALL in one wrapping
          line (no horizontal scroll) — same glass instrument strip + control
          order as the Yearly/Quarterly/Monthly toolbar. Add Goal now lives in
          the row above, right after the week selector. ── */}
      <div
        className="wg-rise mb-3 flex flex-wrap items-center gap-1 rounded-section border border-hairline px-2.5 py-1.5 max-md:px-2.5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
        }}
      >
        {/* View toggle — List | Kanban | Dashboard */}
        <div
          role="group"
          aria-label="Board view"
          className="inline-flex h-7 shrink-0 items-center overflow-hidden rounded-pill border border-hairline-strong bg-surface-soft"
        >
          <ViewToggleButton
            active={view === "list"}
            label="List"
            icon={<List size={11} strokeWidth={2.4} />}
            onClick={() => pickView("list")}
          />
          <ViewToggleButton
            active={view === "kanban"}
            label="Kanban"
            icon={<Columns3 size={11} strokeWidth={2.4} />}
            onClick={() => pickView("kanban")}
          />
          <ViewToggleButton
            active={view === "dashboard"}
            label="Dashboard"
            icon={<LayoutDashboard size={11} strokeWidth={2.4} />}
            onClick={() => pickView("dashboard")}
          />
        </div>

        {/* Ritual state — Saturday commit / Monday approve, reachable in context.
            The chips read the existing stamps; the ritual pages keep the logic. */}
        {adopted.length > 0 && (
          <>
            {commit ? (
              <button
                type="button"
                onClick={() => setCommitOpen(true)}
                title="Freeze next week (Saturday commit)"
                className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-pill border px-2 text-[11px] font-bold transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
                style={
                  // Green once the week is actually frozen; otherwise NEUTRAL.
                  // "Not yet committed" is the ordinary mid-week state, not a
                  // fault — tinting it red made every Tuesday look like a
                  // problem and spent the colour that at-risk goals need.
                  committedCount === adopted.length
                    ? { borderColor: "rgba(21,128,61,0.35)", color: "#166534", background: "rgba(21,128,61,0.08)" }
                    : {
                        borderColor: "var(--color-hairline-strong)",
                        color: "var(--color-ink-soft)",
                        background: "var(--color-surface-card)",
                      }
                }
              >
                <Snowflake size={11} strokeWidth={2.4} />
                {committedCount === adopted.length ? "Frozen" : "Commit"}
              </button>
            ) : (
              <RitualChip
                href={"/goals/commit" as Route}
                icon={<CheckCircle2 size={11} strokeWidth={2.4} />}
                label={`Committed ${committedCount}/${adopted.length}`}
                done={committedCount === adopted.length}
                title="Open the Saturday commit ritual"
              />
            )}
            {(me.isAdmin || canPickPerson) && (
              <RitualChip
                href={"/goals/approve" as Route}
                icon={<BadgeCheck size={11} strokeWidth={2.4} />}
                label={`Approved ${approvedCount}/${adopted.length}`}
                done={approvedCount === adopted.length}
                title="Open the Monday approve ritual"
              />
            )}
            {(me.isAdmin || canPickPerson) && (
              <RitualChip
                href={"/goals/review" as Route}
                icon={<ClipboardList size={11} strokeWidth={2.4} />}
                label="Review"
                done={false}
                title="Open the weekly review scorecard"
              />
            )}
          </>
        )}

        {/* Sort · Areas · Types · Rows · Columns · Export · Bulk upload — the
            SAME controls the Yearly/Quarterly/Monthly toolbar has (compact
            sizing here — Weekly's line carries the ritual chips too), only
            shown for the list view (Kanban/Dashboard lay out every matching
            goal, unpaged). */}
        {view === "list" && (
          <>
            <div className="relative inline-flex h-7 shrink-0 items-center rounded-pill border border-hairline bg-surface-card pl-5 pr-2 transition-colors focus-within:border-altus-red hover:border-hairline-strong">
              <ArrowUpDown size={11} strokeWidth={2.4} className="pointer-events-none absolute left-1.5 text-ink-subtle" />
              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey(v as SortKey)}
                ariaLabel="Sort goals"
                unstyled
                className="flex min-w-[4.25rem] cursor-pointer items-center gap-1 text-[11px] font-bold text-ink-soft"
                options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>

            <MultiPickFilter label="Areas" options={areaFilterOptions} selected={areaFilter} onChange={setAreaFilter} compact />
            <MultiPickFilter label="Types" options={QUARTER_TYPE_OPTIONS} selected={typeFilter} onChange={setTypeFilter} compact />

            <div className="inline-flex h-7 shrink-0 items-center gap-1 rounded-pill border border-hairline bg-surface-card px-2 transition-colors focus-within:border-altus-red hover:border-hairline-strong">
              <span className="text-[11px] font-semibold text-ink-subtle">Rows</span>
              <Select
                value={String(rowsPerPage)}
                onValueChange={(v) => setRowsPerPage(v === "all" ? "all" : Number(v))}
                ariaLabel="Rows per page"
                unstyled
                className="flex min-w-[2rem] cursor-pointer items-center gap-1 text-[11px] font-bold text-ink-strong"
                options={[
                  { value: "25", label: "25" },
                  { value: "50", label: "50" },
                  { value: "100", label: "100" },
                  { value: "all", label: "All" },
                ]}
              />
            </div>

            <ColumnsPicker
              visibleCols={visibleCols}
              onChange={setVisibleCols}
              colOrder={colOrder}
              onReorder={setColOrder}
              compact
            />

            <button
              type="button"
              onClick={exportCsv}
              disabled={displayed.length === 0}
              aria-label="Export visible goals to CSV"
              className={`inline-flex shrink-0 items-center gap-1 h-7 px-2 rounded-pill text-[11px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
            >
              <Download size={11} strokeWidth={2.4} /> Export
            </button>
          </>
        )}

        {/* Bulk upload — the weekly cascade engine's own bulk file import. */}
        <div className="shrink-0">
          <WeeklyGoalsImport
            employeeId={scopeEmp}
            weekStart={weekStart}
            weekLabel={weekLabel}
            isAdmin={me.isAdmin}
          />
        </div>
      </div>

      {/* Body — analytics dashboard, classic list, or the drag-to-plan Kanban */}
      {view === "dashboard" ? (
        <WeeklyDashboard
          goals={adoptedGoals}
          weekNo={weekNo}
          weekStart={weekStart}
          viewedName={isSelf ? null : viewedName}
          // The dashboard reads; the LIST is where a goal is edited. "View goal"
          // hands off to it rather than growing a second editing surface.
          onOpenGoal={() => pickView("list")}
        />
      ) : view === "kanban" ? (
        <WeeklyKanban
          me={me}
          scopeEmp={scopeEmp}
          weekStart={weekStart}
          weekNo={weekNo}
          weekLabel={weekLabel}
          rows={rows}
          dayGoals={dayGoals}
          canWrite={canWrite}
        />
      ) : rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          // Compact by design: the dashed "Add Weekly Goal" tile sits directly
          // below, so this panel only has to say WHERE you are and what fills it
          // — a tall hero here would push the actual next step off the fold.
          className="rounded-section border border-hairline-strong bg-surface-card px-5 py-8 text-center"
        >
          <span
            className="mx-auto mb-2 inline-flex size-9 items-center justify-center rounded-full"
            style={{ background: ACCENT_TINT, color: ACCENT_DEEP }}
          >
            <Target size={17} strokeWidth={2.4} />
          </span>
          <p className="text-[13.5px] font-bold text-ink-strong">
            No goals for W{weekNo} · {formatWeekRangeShort(weekStart)}
          </p>
          <p className="mx-auto mt-0.5 max-w-[44ch] text-[12px] text-ink-muted">
            Add one below, or adopt a monthly goal from the cascade.
          </p>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3">
          <GoalTableView
            ownerNameOf={(g) => roster.find((r) => r.id === g.employeeId)?.name ?? null}
            goals={pagedGoals}
            canWrite
            isAdmin={me.isAdmin}
            roster={roster}
            areaOptions={areaOptions}
            measureOptions={measureOptions}
            typeOptions={typeOptions}
            customLookups={customLookups}
            fyStartYear={fyStartYear}
            level="week"
            variant="weekly"
            actions={WEEKLY_TABLE_ACTIONS}
            detailKind="weekly"
            visibleCols={visibleCols}
            colOrder={colOrder}
            onColOrderChange={setColOrder}
          />

          {rowsPerPage !== "all" && displayed.length > pagedGoals.length && (
            <button
              type="button"
              onClick={() => setRowsPerPage("all")}
              className={`self-start cursor-pointer rounded-full border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong ${FOCUS_RING}`}
            >
              Show all ({displayed.length - pagedGoals.length} more)
            </button>
          )}

          {dropped.length > 0 && (
            <>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  Crossed out ({dropped.length})
                </span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
              {dropped.map((g, i) => (
                <CascadeGoalCard
                  key={g.id}
                  goal={g}
                  me={me}
                  roster={roster}
                  monthGoalOptions={monthGoalOptions}
                  index={i}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Add a single weekly goal — the dashed tile after the list (the pill in
          the controls row opens this same composer via the ref). */}
      <div className="mt-4">
        <WeeklyQuickAdd
          ref={quickAddRef}
          employeeId={scopeEmp}
          weekStart={weekStart}
          weekLabel={weekLabel}
          currentCount={rows.length}
          monthGoalOptions={monthGoalOptions}
          areaOptions={areaOptions}
          measureOptions={measureOptions}
          typeOptions={typeOptions}
          customLookups={customLookups}
          roster={roster}
          isAdmin={me.isAdmin}
        />
      </div>

      {commit && (
        <CommitDialog
          open={commitOpen}
          onClose={() => setCommitOpen(false)}
          member={commit.member}
          nextWeekLabel={commit.nextWeekLabel}
          weekStart={commit.weekStart}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View toggle — List ⇄ Kanban segmented control (mirrors the level board) */
/* ------------------------------------------------------------------ */

function ViewToggleButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      className="cursor-pointer inline-flex h-full items-center gap-1 px-2 text-[11px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
      style={
        active
          ? {
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              color: "#fff",
              boxShadow: "0 6px 14px -8px var(--color-altus-red-deep)",
            }
          : { background: "transparent", color: "var(--color-ink-subtle)" }
      }
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ritual chip — a stamp-state pill that deep-links to its ritual page  */
/* (Commit / Approve / Review). Green when fully stamped, amber-tinted  */
/* while pending — no logic duplicated, the pages own the gates.        */
/* ------------------------------------------------------------------ */

function RitualChip({
  href,
  icon,
  label,
  done,
  title,
}: {
  href: Route;
  icon: React.ReactNode;
  label: string;
  done: boolean;
  title: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2 text-[11px] font-bold transition-colors hover:bg-surface-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
      style={
        // Same rule as the commit button: green means finished, neutral means
        // "still in progress". Pending is not an error state.
        done
          ? {
              background: "rgba(21,128,61,0.08)",
              borderColor: "rgba(21,128,61,0.35)",
              color: "#15803d",
            }
          : {
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline-strong)",
              color: "var(--color-ink-soft)",
            }
      }
    >
      {icon}
      {label}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Weekly quick-add — create ONE weekly goal in the week + person in    */
/* view. Mirrors board-quick-add's UX AND its full field set            */
/* (Area · Goal · Measure · Type · Actual · Target · Team               */
/* Members) plus the weekly-only "Monthly goal" link. Writes through the */
/* CASCADE weekly action `addWeekGoal`, which now persists every field   */
/* onto the weekly_goals row. Keeps the WeeklyGoalDrawer, save-and-add-  */
/* another (drawer stays open + eyebrow count bumps), an "End" button,   */
/* and keyboard-first ⌘/Ctrl+Enter.                                      */
/* ------------------------------------------------------------------ */

const QUICK_ADD_FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

export interface WeeklyQuickAddHandle {
  open: () => void;
}

const WeeklyQuickAdd = React.forwardRef<
  WeeklyQuickAddHandle,
  {
    employeeId: string;
    weekStart: string;
    weekLabel: string;
    currentCount: number;
    monthGoalOptions: MonthGoalOption[];
    areaOptions: string[];
    measureOptions: string[];
    typeOptions: string[];
    customLookups: { areas: string[]; measures: string[]; types: string[] };
    roster: RosterMember[];
    isAdmin: boolean;
  }
>(function WeeklyQuickAdd(props, ref) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("");
  const [measure, setMeasure] = React.useState("");
  const [type, setType] = React.useState("Goal");
  const [actual, setActual] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [team, setTeam] = React.useState<TeamMemberWeight[]>([]);
  const [monthGoalId, setMonthGoalId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [addedCount, setAddedCount] = React.useState(0);
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpen(true);
        requestAnimationFrame(() => titleRef.current?.focus());
      },
    }),
    [],
  );

  function reset() {
    setTitle("");
    setArea("");
    setMeasure("");
    setType("Goal");
    setActual("");
    setTarget("");
    setTargetDate("");
    setTeam([]);
    setMonthGoalId("");
    setError(null);
  }

  function closeAll() {
    setOpen(false);
    reset();
    setAddedCount(0);
  }

  function submit() {
    const t = title.trim();
    if (!t) {
      setError("Give the goal a name before saving.");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    setSaving(true);

    const numOrNull = (s: string): string | null => {
      const v = s.trim();
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? String(n) : null;
    };

    void addWeekGoal({
      employeeId: props.employeeId,
      weekStart: props.weekStart,
      title: t,
      area: area.trim() || null,
      uom: measure.trim() || null,
      category: type.trim() || null,
      actualQty: numOrNull(actual),
      targetQty: numOrNull(target),
      teamInvolved: team.length ? team : null,
      monthGoalId: monthGoalId || null,
      targetDate: targetDate.trim() || null,
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Save-and-add-another: keep the drawer open, clear the fields, bump the
        // running count in the eyebrow, refocus the first field. "End" closes.
        setAddedCount((c) => c + 1);
        reset();
        titleRef.current?.focus();
        router.refresh();
      })
      .catch((e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Couldn't save the goal. Try again.");
      });
  }

  return (
    <>
      {/* The add-goal control, now IDENTICAL to the one the Yearly / Quarterly /
          Monthly boards use (`board/board-quick-add.tsx`): a compact neutral
          pill that sits at its natural width on the left.

          It replaces a full-width red dashed banner. That banner was the widest
          and loudest element on the page — on the Dashboard it out-shouted the
          performance numbers and the at-risk goals it sat beneath, and a
          secondary "create" affordance should never win that contest. Same
          composer, same action, same permissions; only the shouting is gone. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => titleRef.current?.focus());
        }}
        className={`wg-btn group inline-flex w-auto cursor-pointer items-center justify-center gap-2 self-start rounded-full border px-4 py-2.5 text-[13.5px] font-bold transition-colors hover:bg-surface-soft ${QUICK_ADD_FOCUS_RING}`}
        style={{
          borderColor: "var(--color-hairline-strong)",
          color: "var(--color-ink-soft)",
          background: "var(--color-surface-soft)",
        }}
      >
        <span
          className="inline-flex size-6 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
            color: "var(--color-ink-muted)",
          }}
        >
          <Plus size={15} strokeWidth={2.8} />
        </span>
        Add New Goal
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
          · into {props.weekLabel}
        </span>
      </button>

      <WeeklyGoalDrawer
        open={open}
        onClose={closeAll}
        eyebrow={`New weekly goal · #${props.currentCount + addedCount + 1}`}
        title="Add Goal for the Week"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* Reach bulk import straight from the composer — its dialog portals
                  to <body> at z-200, above this drawer (z-120), so it stacks on
                  top rather than being buried. Closing the drawer unmounts it. */}
              <WeeklyGoalsImport
                employeeId={props.employeeId}
                weekStart={props.weekStart}
                weekLabel={props.weekLabel}
                isAdmin={props.isAdmin}
              />
              <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                {addedCount > 0 ? `${addedCount} added · keep going, or End` : "⌘/Ctrl + Enter to save"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeAll}
                className={`inline-flex items-center rounded-full border px-5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                End
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${QUICK_ADD_FOCUS_RING}`}
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                Add Goal
              </button>
            </div>
          </div>
        }
      >
        <div
          className="grid gap-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        >
          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-altus-red"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}
            >
              {error}
            </p>
          )}

          {/* Area — managed dropdown (admins can add options). */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Area</span>
            <GoalLookupSelect
              kind="area"
              noun="Area"
              value={area}
              onChange={setArea}
              options={props.areaOptions}
              custom={props.customLookups.areas}
              isAdmin={props.isAdmin}
              placeholder="Choose an area"
            />
          </div>

          {/* Goal (→ target_done, the row's title everywhere). */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What does done look like this week?"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[15px] font-medium text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
          </label>

          {/* Measure (→ uom) + Type (→ goal_type). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Measure</span>
              <GoalLookupSelect
                kind="measure"
                noun="Measure"
                value={measure}
                onChange={setMeasure}
                options={props.measureOptions}
                custom={props.customLookups.measures}
                isAdmin={props.isAdmin}
                placeholder="Choose a measure"
              />
            </div>
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Type</span>
              <GoalLookupSelect
                kind="type"
                noun="Type"
                value={type}
                onChange={setType}
                options={props.typeOptions}
                custom={props.customLookups.types}
                isAdmin={props.isAdmin}
                placeholder="Choose a type"
              />
            </div>
          </div>

          {/* Actual vs Target (% Done = Actual ÷ Target). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Actual</span>
              <input
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 0"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 100"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
          </div>

          {/* Target Date (deadline) — turns amber ≤7 days out, red once overdue. */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target Date</span>
            <DateInput
              value={targetDate}
              onChange={setTargetDate}
              ariaLabel="Target date"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-medium text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              When should this be done? Amber ≤7 days out, red once overdue.
            </span>
          </label>

          {/* Team members (each with their OWN weight). */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Team Members</span>
            <TeamWeightsField value={team} roster={props.roster} onChange={setTeam} />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Add the people on this goal — each gets their own weight (share).
            </span>
          </div>

          {/* Link up to a monthly cascade goal (optional parent). */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Monthly Goal</span>
            <Select
              value={monthGoalId}
              onValueChange={setMonthGoalId}
              ariaLabel="Monthly goal"
              placeholder="No monthly link"
              searchable={props.monthGoalOptions.length > 8}
              searchPlaceholder="Search monthly goals…"
              className="h-10"
              options={[
                { value: "", label: "No monthly link" },
                ...props.monthGoalOptions.map((m) => ({ value: m.id, label: m.title })),
              ]}
            />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Ladder this week&apos;s goal up to its monthly parent (optional).
            </span>
          </label>
        </div>
      </WeeklyGoalDrawer>
    </>
  );
});
