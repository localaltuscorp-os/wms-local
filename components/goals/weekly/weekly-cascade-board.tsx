"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  Search,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { fireToast } from "@/lib/toast";
import { addWeekGoal, updateWeeklyCascadeFields } from "@/app/(app)/goals/weekly/actions";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { ViewingSelect } from "@/components/goals/shared/viewing-select";
import { usePageChromeSlots } from "@/components/layout/page-chrome-slots";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
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
import { GOAL_TYPE_LABELS, type GoalType, type TaskStatus } from "@/db/enums";
import type { BoardMe, CascadeWeeklyGoal, MonthGoalOption, RosterMember } from "./types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** localStorage key for the weekly board's List ⇄ Kanban preference. */
const WEEKLY_VIEW_STORE_KEY = "goals-weekly-view";

type WeeklyStatusAxis = "doer" | "initiator";
type WeeklyStatusKpi =
  | "total"
  | "not_read"
  | "not_started"
  | "initiated"
  | "follow_up"
  | "need_info"
  | "done"
  | "abandoned"
  | "pending"
  | "approved"
  | "not_approved"
  | "on_hold"
  | "cancelled"
  | "archived";

const WEEKLY_DOER_KPIS = [
  { key: "total", label: "Total", tone: "neutral" as const },
  { key: "not_read", label: "Not Read", tone: "blue" as const },
  { key: "not_started", label: "Not Started", tone: "slate" as const },
  { key: "initiated", label: "Initiated", tone: "amber" as const },
  { key: "follow_up", label: "Follow Up", tone: "orange" as const },
  { key: "need_info", label: "Need Info", tone: "red" as const },
  { key: "done", label: "Done", tone: "green" as const },
  { key: "abandoned", label: "Abandoned", tone: "blue" as const },
] as const;

const WEEKLY_INITIATOR_KPIS = [
  { key: "total", label: "Total", tone: "neutral" as const },
  { key: "done", label: "Done", tone: "green" as const },
  { key: "abandoned", label: "Abandoned", tone: "blue" as const },
  { key: "pending", label: "Pending", tone: "amber" as const },
  { key: "approved", label: "Approved", tone: "green" as const },
  { key: "not_approved", label: "Not Approved", tone: "red" as const },
  { key: "on_hold", label: "On Hold", tone: "yellow" as const },
  { key: "cancelled", label: "Cancelled", tone: "orange" as const },
  { key: "archived", label: "Archived", tone: "slate" as const },
] as const;

const WEEKLY_DOER_STATUS_LABELS: Record<string, string> = {
  not_read: "Not Read",
  not_started: "Not Started",
  initiated: "Initiated",
  follow_up: "Follow Up",
  need_info: "Need Info",
  done: "Done",
  abandoned: "Abandoned",
};

const WEEKLY_INITIATOR_STATUS_LABELS: Record<string, string> = {
  not_applicable: "Not Applicable",
  pending: "Pending",
  approved: "Approved",
  not_approved: "Not Approved",
  on_hold: "On Hold",
  archived: "Archived",
  cancelled: "Cancelled",
};

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
    // THE INITIATOR AXIS. The shared table's Initiator Status column was removed
    // on 2026-09-15, so nothing on this board renders the verdict today — it is
    // still passed because the row type carries it and the detail views read it.
    approvalStatus: g.approvalStatus ?? null,
    isPutAway: g.isPutAway ?? false,
    reviewedById: g.reviewedById ?? null,
    approverStatus: g.approverStatus ?? null,
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
  const pageChromeSlots = usePageChromeSlots();
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

  /* ?focus=<goalId> — scroll that card into view and flash it.
   *
   * The pinned "This Week's Goals" block on the WMS dashboard, the Tasks list
   * and My Day deep-links here (lib/weekly-goals/as-task-row.ts). Landing on
   * the right WEEK is most of the job, but on a full week the goal you clicked
   * can be six cards down — arriving at the top of a list and hunting for it is
   * not "opening the goal".
   *
   * A DOM WRITE, NOT setState. This runs once per arrival and touches one
   * element; routing it through React state would re-render every card on the
   * board to draw a ring on one of them, and the ring has to come off on a
   * timer anyway. Updating something outside React is what an effect is for —
   * the same call the sidebar's collapse rules and Status by Doer's sticky
   * headers make.
   *
   * `rows.length` is in the deps, not `rows`: the card cannot be scrolled to
   * before it has rendered, and the list identity changes on every keystroke
   * commit further down the board — which would re-flash the card while
   * somebody was editing.
   */
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("focus");
    if (!id) return;
    // Two frames: one for the cards to commit, one for the motion/react entry
    // transform to settle, or the scroll lands on where the card was mid-slide.
    const t = window.setTimeout(() => {
      const el = document.getElementById(`wg-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const previous = el.style.boxShadow;
      el.style.transition = "box-shadow 260ms ease";
      el.style.boxShadow =
        "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 55%, transparent), 0 10px 30px -12px rgba(15,23,42,0.35)";
      window.setTimeout(() => {
        el.style.boxShadow = previous;
      }, 2400);
    }, 120);
    return () => window.clearTimeout(t);
  }, [rows.length]);

  // GoalDTO projection of the adopted goals — the filters, sort, export and
  // the table itself all operate on this shape, same as the Yearly/Quarterly/
  // Monthly boards.
  const adoptedGoals = React.useMemo(() => adopted.map((g) => weeklyToGoalDTO(g, nameOf)), [adopted, nameOf]);

  const goalTypeLabel = React.useCallback(
    (g: GoalDTO) => (g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""),
    [],
  );

  // Sort · Area · Type filters, Rows-per-page + Columns — the SAME toolbar
  // controls the Yearly/Quarterly/Monthly boards have.
  const [sortKey, setSortKey] = React.useState<SortKey>("position");
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [areaFilter, setAreaFilter] = React.useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = React.useState<Set<string>>(new Set());
  const [doerStatusFilter, setDoerStatusFilter] = React.useState<Set<string>>(new Set());
  const [initiatorStatusFilter, setInitiatorStatusFilter] = React.useState<Set<string>>(new Set());
  // The top-bar View switch dispatches this local event for Goals pages. Weekly
  // reads the exact same two perspectives as Yearly without changing the URL,
  // permissions, or any persisted goal data.
  const [weeklyStatusAxis, setWeeklyStatusAxis] = React.useState<WeeklyStatusAxis>("doer");
  React.useEffect(() => {
    const onAxisChange = (event: Event) => {
      const axis = (event as CustomEvent<unknown>).detail;
      if (axis === "doer" || axis === "initiator") setWeeklyStatusAxis(axis);
    };
    window.addEventListener("altus:module-status-axis", onAxisChange);
    return () => window.removeEventListener("altus:module-status-axis", onAxisChange);
  }, []);

  const weeklyStatusCounts = React.useMemo<Record<WeeklyStatusKpi, number>>(() => {
    const counts: Record<WeeklyStatusKpi, number> = {
      total: adoptedGoals.length,
      not_read: 0,
      not_started: 0,
      initiated: 0,
      follow_up: 0,
      need_info: 0,
      done: 0,
      abandoned: 0,
      pending: 0,
      approved: 0,
      not_approved: 0,
      on_hold: 0,
      cancelled: 0,
      archived: 0,
    };
    for (const goal of adoptedGoals) {
      const doer = goal.status === "dont_know" ? "not_read" : (goal.status ?? "not_started");
      if (doer in counts) counts[doer as WeeklyStatusKpi]++;
      const initiator = goal.isPutAway
        ? "archived"
        : (goal.approverStatus ?? goal.approvalStatus ?? "pending");
      if (initiator in counts) counts[initiator as WeeklyStatusKpi]++;
    }
    return counts;
  }, [adoptedGoals]);

  const weeklyStatusKpis = weeklyStatusAxis === "doer" ? WEEKLY_DOER_KPIS : WEEKLY_INITIATOR_KPIS;
  const weeklyStatusKpiActive = (key: WeeklyStatusKpi) => {
    if (key === "total") return doerStatusFilter.size === 0 && initiatorStatusFilter.size === 0;
    const isDoer = WEEKLY_DOER_STATUS_LABELS[key] !== undefined;
    const selected = isDoer ? doerStatusFilter : initiatorStatusFilter;
    return selected.size === 1 && selected.has(key);
  };
  const toggleWeeklyStatusKpi = (key: WeeklyStatusKpi) => {
    if (key === "total") {
      setDoerStatusFilter(new Set());
      setInitiatorStatusFilter(new Set());
      return;
    }
    const setFilter = WEEKLY_DOER_STATUS_LABELS[key] !== undefined
      ? setDoerStatusFilter
      : setInitiatorStatusFilter;
    setFilter((current) => current.size === 1 && current.has(key) ? new Set() : new Set([key]));
  };

  /** List rows carry the same native drag payload as the higher-level Goals
   * boards. A KPI drop updates only the persisted Doer status; it intentionally
   * does not change the weekly goal's percentage or its Kanban placement. */
  const dropWeeklyGoalOnKpi = React.useCallback(
    (event: React.DragEvent<HTMLButtonElement>, kpiStatus: string) => {
      event.preventDefault();
      if (!canWrite || !(kpiStatus in WEEKLY_DOER_STATUS_LABELS)) return;

      const id = event.dataTransfer.getData("application/x-altus-goal-id");
      const goal = adoptedGoals.find((item) => item.id === id);
      if (!goal) return;

      const status = (kpiStatus === "not_read" ? "dont_know" : kpiStatus) as TaskStatus;
      if (goal.status === status) return;

      void updateWeeklyCascadeFields({ id: goal.id, status }).then((result) => {
        if (!result.ok) {
          fireToast({ message: result.error, type: "error" });
          return;
        }
        fireToast({ message: `Doer status changed to ${WEEKLY_DOER_STATUS_LABELS[kpiStatus]}.`, type: "success" });
        router.refresh();
      });
    },
    [adoptedGoals, canWrite, router],
  );
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
      if (areaFilter.size > 0 && !areaFilter.has(g.area ?? "")) return false;
      if (typeFilter.size > 0 && !typeFilter.has(goalTypeLabel(g))) return false;
      const doerStatus = g.status === "dont_know" ? "not_read" : (g.status ?? "not_started");
      if (doerStatusFilter.size > 0 && !doerStatusFilter.has(doerStatus)) return false;
      const initiatorStatus = g.isPutAway
        ? "archived"
        : (g.approverStatus ?? g.approvalStatus ?? "pending");
      if (initiatorStatusFilter.size > 0 && !initiatorStatusFilter.has(initiatorStatus)) return false;
      const query = deferredSearch.trim().toLowerCase();
      if (query && ![g.title, g.area, g.notes].some((value) => value?.toLowerCase().includes(query))) return false;
      return true;
    },
    [areaFilter, typeFilter, doerStatusFilter, initiatorStatusFilter, deferredSearch, goalTypeLabel],
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

  const weeklyFilterControls = [
    { key: "areas", active: areaFilter.size > 0, control: <MultiPickFilter label="Areas" options={areaFilterOptions} selected={areaFilter} onChange={setAreaFilter} taskStyle /> },
    { key: "types", active: typeFilter.size > 0, control: <MultiPickFilter label="Types" options={QUARTER_TYPE_OPTIONS} selected={typeFilter} onChange={setTypeFilter} taskStyle /> },
    { key: "doer", active: doerStatusFilter.size > 0, control: <MultiPickFilter label="Doer Status" options={["Not Read", "Not Started", "Initiated", "Follow Up", "Need Info", "Done", "Abandoned"]} selected={new Set([...doerStatusFilter].map((status) => ({ not_read: "Not Read", not_started: "Not Started", initiated: "Initiated", follow_up: "Follow Up", need_info: "Need Info", done: "Done", abandoned: "Abandoned" })[status] ?? status))} onChange={(labels) => setDoerStatusFilter(new Set(Object.entries({ not_read: "Not Read", not_started: "Not Started", initiated: "Initiated", follow_up: "Follow Up", need_info: "Need Info", done: "Done", abandoned: "Abandoned" }).filter(([, label]) => labels.has(label)).map(([status]) => status)))} taskStyle /> },
    { key: "initiator", active: initiatorStatusFilter.size > 0, control: <MultiPickFilter label="Initiator Status" options={["Not Applicable", "Pending", "Approved", "Not Approved", "On Hold", "Archived", "Cancelled"]} selected={new Set([...initiatorStatusFilter].map((status) => ({ not_applicable: "Not Applicable", pending: "Pending", approved: "Approved", not_approved: "Not Approved", on_hold: "On Hold", archived: "Archived", cancelled: "Cancelled" })[status] ?? status))} onChange={(labels) => setInitiatorStatusFilter(new Set(Object.entries({ not_applicable: "Not Applicable", pending: "Pending", approved: "Approved", not_approved: "Not Approved", on_hold: "On Hold", archived: "Archived", cancelled: "Cancelled" }).filter(([, label]) => labels.has(label)).map(([status]) => status)))} taskStyle /> },
  ].sort((left, right) => Number(right.active) - Number(left.active));

  const weeklyActiveFilterChips = [
    ...[...areaFilter].map((value) => ({
      key: `area-${value}`,
      label: `Area: ${value}`,
      clear: () => setAreaFilter((current) => new Set([...current].filter((item) => item !== value))),
    })),
    ...[...typeFilter].map((value) => ({
      key: `type-${value}`,
      label: `Type: ${value}`,
      clear: () => setTypeFilter((current) => new Set([...current].filter((item) => item !== value))),
    })),
    ...[...doerStatusFilter].map((value) => ({
      key: `doer-${value}`,
      label: `Doer: ${WEEKLY_DOER_STATUS_LABELS[value] ?? value}`,
      clear: () => setDoerStatusFilter((current) => new Set([...current].filter((item) => item !== value))),
    })),
    ...[...initiatorStatusFilter].map((value) => ({
      key: `initiator-${value}`,
      label: `Initiator: ${WEEKLY_INITIATOR_STATUS_LABELS[value] ?? value}`,
      clear: () => setInitiatorStatusFilter((current) => new Set([...current].filter((item) => item !== value))),
    })),
  ];

  function clearWeeklyFilters() {
    setAreaFilter(new Set());
    setTypeFilter(new Set());
    setDoerStatusFilter(new Set());
    setInitiatorStatusFilter(new Set());
  }

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-auto bg-surface-soft px-7 pt-4 pb-10 max-md:px-4 max-md:pt-3"
          : "relative mx-auto w-full min-w-0 max-w-[1560px] px-7 pt-4 pb-16 max-md:px-4 max-md:pt-3"
      }
      style={{ color: "var(--color-ink-strong)" }}
    >
      {view === "list" && pageChromeSlots?.ribbon && createPortal(
        <div className="no-scrollbar mx-auto flex w-full min-w-0 max-w-[1600px] flex-nowrap items-center gap-x-1 overflow-x-auto px-6 py-2.5 max-md:px-4">
          {weeklyActiveFilterChips.length > 0 && (
            <>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink-muted">
                {weeklyActiveFilterChips.length} active
              </span>
              {weeklyActiveFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className={`filter-pill text-[11.5px] font-bold ${FOCUS_RING}`}
                  data-active="true"
                  style={{ ["--filter-pill-tint" as string]: "var(--color-altus-red)" }}
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <span className="max-w-[190px] truncate">{chip.label}</span>
                  <X size={14} strokeWidth={2.5} aria-hidden />
                </button>
              ))}
              <button
                type="button"
                onClick={clearWeeklyFilters}
                className={`shrink-0 px-1 text-[13px] font-bold text-altus-red transition-colors hover:text-altus-red-deep ${FOCUS_RING}`}
              >
                Clear all
              </button>
            </>
          )}
          {weeklyFilterControls.map(({ key, control }) => <React.Fragment key={key}>{control}</React.Fragment>)}
          <div className="ml-auto shrink-0">
            <CollapsibleSearch scope="goals, areas, notes">
              <div className="relative min-w-[180px] max-w-[360px]">
                <Search size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search goals, areas, notes"
                  title="Search goals, areas, and notes in this weekly list"
                  aria-label="Search goals, areas, and notes in this weekly list"
                  className={`h-9 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-9 text-[13.5px] font-medium text-ink-strong transition-colors focus:border-altus-red ${FOCUS_RING}`}
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full text-ink-subtle hover:text-ink-strong ${FOCUS_RING}`}>
                    <X size={14} />
                  </button>
                )}
              </div>
            </CollapsibleSearch>
          </div>
        </div>,
        pageChromeSlots.ribbon,
      )}
      {/* ── HEADER — the SAME Tasks-page treatment as Yearly/Quarterly/Monthly:
          a slim title+stat-chip header, then a compact glass-strip control row
          for Week / Viewing. ── */}
      <header className="wg-rise relative mb-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap min-w-0">
          <h1
            /* `page-heading` (app/globals.css) — the display face at 900 and
               the shared size ramp, black. The ramp that used to sit inline
               here travelled into that class unchanged; the brand red and
               the sheen belong to the chrome (the rail's wordmark and the
               top bar), not to the page body. */
            className="page-heading hidden shrink-0"
          >
            Weekly Goals
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {weeklyStatusKpis.map((kpi) => (
              <GoalStatChip
                key={kpi.key}
                label={kpi.label}
                value={weeklyStatusCounts[kpi.key]}
                tone={kpi.tone}
                active={weeklyStatusKpiActive(kpi.key)}
                dropStatus={weeklyStatusAxis === "doer" && kpi.key !== "total" ? kpi.key : undefined}
                onGoalDrop={dropWeeklyGoalOnKpi}
                onClick={() => toggleWeeklyStatusKpi(kpi.key)}
              />
            ))}
          </div>
        </div>
      </header>

      <div
        className="wg-rise mb-3 flex items-center gap-2 flex-wrap rounded-none border border-hairline px-3 py-2 max-md:px-3"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
        }}
      >
        {/* Week selector + Add Goal + the person picker, all grouped on the
            RIGHT: ..... [ W19 · 10 Aug – 16 Aug ▾ ] [ + Add Goal ] [ Viewing ]. */}
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          <div
            role="group"
            aria-label="Board view"
            className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-soft"
          >
            <ViewToggleButton active={view === "list"} label="List" icon={<List size={12} strokeWidth={2.4} />} onClick={() => pickView("list")} />
            <ViewToggleButton active={view === "kanban"} label="Kanban" icon={<Columns3 size={12} strokeWidth={2.4} />} onClick={() => pickView("kanban")} />
            <ViewToggleButton active={view === "dashboard"} label="Dashboard" icon={<LayoutDashboard size={12} strokeWidth={2.4} />} onClick={() => pickView("dashboard")} />
          </div>
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

          <button
            type="button"
            onClick={exportCsv}
            disabled={displayed.length === 0}
            aria-label="Export visible goals to CSV"
            className={`inline-flex shrink-0 items-center gap-1.5 h-9 px-3 rounded-pill text-[12px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
          >
            <Download size={13} strokeWidth={2.4} /> Export
          </button>
          {adopted.length > 0 && (
            <>
              {commit ? (
                <button
                  type="button"
                  onClick={() => setCommitOpen(true)}
                  title="Freeze next week (Saturday commit)"
                  className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[11px] font-bold transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
                  style={
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
          <div className="shrink-0">
            <WeeklyGoalsImport employeeId={scopeEmp} weekStart={weekStart} weekLabel={weekLabel} isAdmin={me.isAdmin} />
          </div>
          {view === "list" && (
            <>
              <div className="relative inline-flex h-8 shrink-0 items-center rounded-lg border border-hairline bg-surface-card pl-5 pr-2 transition-colors focus-within:border-altus-red hover:border-hairline-strong">
                <ArrowUpDown size={12} strokeWidth={2.4} className="pointer-events-none absolute left-1.5 text-ink-subtle" />
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)} ariaLabel="Sort goals" unstyled className="flex min-w-[4.25rem] cursor-pointer items-center gap-1 text-[11px] font-bold text-ink-soft" options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
              </div>
              <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-hairline bg-surface-card px-2 transition-colors focus-within:border-altus-red hover:border-hairline-strong">
                <span className="text-[11px] font-semibold text-ink-subtle">Rows</span>
                <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(v === "all" ? "all" : Number(v))} ariaLabel="Rows per page" unstyled className="flex min-w-[2rem] cursor-pointer items-center gap-1 text-[11px] font-bold text-ink-strong" options={[{ value: "25", label: "25" }, { value: "50", label: "50" }, { value: "100", label: "100" }, { value: "all", label: "All" }]} />
              </div>
              <ColumnsPicker visibleCols={visibleCols} onChange={setVisibleCols} colOrder={colOrder} onReorder={setColOrder} compact />
            </>
          )}
        </div>
      </div>

      {/* ── Feature toolbar — view toggle · ritual chips · Sort · Areas ·
          Types · Rows · Columns · Export · Bulk upload, ALL in one wrapping
          line (no horizontal scroll) — same glass instrument strip + control
          order as the Yearly/Quarterly/Monthly toolbar. Add Goal now lives in
          the row above, right after the week selector. ── */}
      <div
        className="hidden"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
        }}
      >
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
        {/* Bulk upload — the weekly cascade engine's own bulk file import. */}
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
            // Viewing someone else's week means managing them (the page scopes it).
            managesViewed={scopeEmp !== me.id}
            visibleCols={visibleCols}
            colOrder={colOrder}
            onColOrderChange={setColOrder}
            onRowDragStart={(goal, event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-altus-goal-id", goal.id);
              event.dataTransfer.setData("text/plain", goal.title);
            }}
          />

          {rowsPerPage !== "all" && displayed.length > pagedGoals.length && (
            <button
              type="button"
              onClick={() => setRowsPerPage("all")}
              className={`self-start cursor-pointer rounded-pill border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong ${FOCUS_RING}`}
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
        className={`wg-btn group inline-flex w-auto cursor-pointer items-center justify-center gap-2 self-start rounded-pill border px-4 py-2.5 text-[13.5px] font-bold transition-colors hover:bg-surface-soft ${QUICK_ADD_FOCUS_RING}`}
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
                className={`inline-flex items-center rounded-pill border px-5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                End
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className={`wg-btn inline-flex items-center gap-1.5 rounded-pill px-6 py-2.5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${QUICK_ADD_FOCUS_RING}`}
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
              Add the people on this goal - each gets their own weight (share).
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
