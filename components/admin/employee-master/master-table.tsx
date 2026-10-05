"use client";

import * as React from "react";
import {
  BadgeCheck,
  ChevronDown,
  Clock3,
  Columns3,
  Download,
  Filter,
  GraduationCap,
  Moon,
  Search,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { EmployeeMasterRow, MasterOptions } from "@/lib/employees/master-query";
import { cn } from "@/lib/utils";
/**
 * The list's pure filter and sort rules.
 *
 * Extracted so they can be tested without this file's import graph — which
 * reaches the workspace, the employee actions and `lib/db` — coming with
 * them. See lib/employees/master-filters.ts.
 */
import {
  EMPLOYEE_STATUS_TABS,
  EMPLOYEE_STATUS_LABELS,
  matchesStatusTab,
  codeSortValue,
  type EmployeeStatusTab,
} from "@/lib/employees/master-filters";
import { EMPLOYEE_TYPE_OPTIONS, WORKER_TYPE_LABELS } from "@/lib/attendance/worker-type";
import { EmployeeWorkspace } from "./workspace";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { MasterRowActions } from "./row-actions";
import { ProbationCell, istToday } from "./probation-cell";
import { formatDate } from "@/lib/format";

/**
 * THE EMPLOYEE MASTER TABLE.
 *
 * Compact and professional, matching the existing People screens rather than
 * introducing a second visual language (§2). Everything below the header row is
 * one click away from the workspace: there is NO separate "view" and "edit"
 * experience, because the brief rules one out (§4) and because two of them is
 * how a read screen and a write screen come to disagree about a record.
 *
 * ── WHY THE WHOLE ROSTER IS IN THE BROWSER ─────────────────────────────────
 * Filtering, sorting and searching happen client-side over a list the server
 * already sent whole. That is a deliberate size judgement, not an oversight:
 * the roster is 29 people and will be hundreds, not millions, so a round trip
 * per keystroke would add latency and a pagination contract for no benefit. The
 * export writes the FILTERED view for the same reason — what you see is what
 * you get, with no second query that could disagree.
 *
 * If this ever needs to serve thousands, the seam is `loadEmployeeMasterRows`:
 * it already returns flat rows, so moving the filter to SQL changes this file's
 * data source and nothing else.
 */

/* ── Columns ──────────────────────────────────────────────────────────────── */

type ColumnKey =
  | "employee"
  | "employeeCode"
  | "function"
  | "entity"
  | "designation"
  | "ctc"
  | "doj"
  | "probationEnds"
  | "shift"
  | "status"
  | "manager"
  | "teamLead"
  | "trainPass"
  | "doc"
  | "personalEmail"
  | "phone"
  | "tds"
  | "ptExempt"
  | "backgroundCheck";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** In the default view (§2's order). Everything else is opt-in via Columns. */
  default: boolean;
  /** Right-aligned numerics. */
  numeric?: boolean;
  /** Hidden entirely when the viewer may not see pay. */
  pay?: boolean;
  value: (r: EmployeeMasterRow) => string;
  sort?: (r: EmployeeMasterRow) => string | number | null;
  /**
   * Overrides what the cell PRINTS while `value` stays what the cell MEANS —
   * the CSV export, the search haystack and the sort all keep reading `value`.
   * Used by the Probation column, whose cell shows a date AND a derived state tag
   * (components/admin/employee-master/probation-cell.tsx) where the export needs
   * the bare date.
   */
  render?: (r: EmployeeMasterRow) => React.ReactNode;
}

const DASH = "—";
const EMPLOYEE_SELECT_WIDTH = 36;
const EMPLOYEE_DETAILS_WIDTH = 220;
const EMPLOYEE_CODE_WIDTH = 140;
const EMPLOYEE_CODE_LEFT = EMPLOYEE_SELECT_WIDTH + EMPLOYEE_DETAILS_WIDTH;
const t = (v: string | null | undefined) => (v == null || v === "" ? DASH : v);
const yn = (v: boolean) => (v ? "Yes" : "No");

function inr(n: number | null): string {
  if (n == null) return DASH;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "second_half" → "Second Half". The shared label map, so the table and the
 *  workspace name the same value identically. */
function workerTypeLabel(w: string | null): string | null {
  if (!w) return null;
  return WORKER_TYPE_LABELS[w as keyof typeof WORKER_TYPE_LABELS] ?? w.replace(/_/g, " ");
}

function ymd(v: string | Date | null): string {
  if (!v) return DASH;
  const d = typeof v === "string" ? new Date(`${v}T00:00:00`) : v;
  if (Number.isNaN(d.getTime())) return DASH;
  return formatDate(d);
}

function dateSortValue(value: string | Date | null): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date
    ? value.getTime()
    : Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * THE DEFAULT ORDER IS THE BRIEF'S (§2), exactly: Employee Details, Function,
 * Entity, Designation, CTC, DOJ, Probation Ends On, Shift Type, Status.
 *
 * Team Lead is deliberately NOT default — the brief says so in as many words —
 * but it IS available under Columns, because it is a thing people filter on.
 */
const COLUMNS: ColumnDef[] = [
  { key: "employee", label: "Employee Details", default: true, value: (r) => r.name, sort: (r) => r.name },
  /**
   * EMPLOYEE CODE — its own column now, not a line inside Employee Details.
   *
   * Sorted by (prefix, number) rather than as text, so K-9 does not come after
   * K-101. `codeSortValue` pads the number; a plain string sort on "A-101" is
   * lexicographic and puts A-1000 between A-100 and A-101.
   */
  { key: "employeeCode", label: "Employee Code", default: true, value: (r) => t(r.employeeCode), sort: (r) => r.employeeCode ? codeSortValue(r.employeeCode) : null },
  /**
   * FUNCTION.
   *
   * Department and Function were two fields answering one question, and the one
   * with the data was Department: 18 values and ~27 memberships driving team
   * scoping and form audiences, against Function's zero rows and zero people.
   * This column relabelled the one with the data.
   *
   * Migration 0234 finished the job in the database: those 18 rows now LIVE in
   * the `functions` table, with their original ids, and `employees.department_id`
   * points there. So `departmentName` below is the Function, not a stand-in for
   * it. The old empty `functionName` field is gone entirely.
   */
  { key: "function", label: "Function", default: true, value: (r) => t(r.departmentName), sort: (r) => r.departmentName },
  { key: "entity", label: "Entity", default: true, value: (r) => t(r.entityName), sort: (r) => r.entityName },
  { key: "designation", label: "Designation", default: true, value: (r) => t(r.designationName), sort: (r) => r.designationName },
  { key: "ctc", label: "CTC", default: true, numeric: true, pay: true, value: (r) => (r.monthlyCtc == null ? DASH : `${inr(r.monthlyCtc)}/mo`), sort: (r) => r.monthlyCtc },
  { key: "doj", label: "DOJ", default: true, value: (r) => ymd(r.joinedAt), sort: (r) => dateSortValue(r.joinedAt) },
  {
    key: "probationEnds",
    label: "Probation Ends",
    default: true,
    // The export keeps the bare date; the CELL prints the date plus whether it
    // has passed (0244). The date is never replaced by the word "Completed" —
    // it is historical HR data and it is what an audit asks for.
    value: (r) => ymd(r.probationEnd),
    sort: (r) => dateSortValue(r.probationEnd),
    render: (r) => <ProbationCell probationEnd={r.probationEnd} today={istToday()} />,
  },
  /**
   * SHIFT TYPE — this is the WORKER TYPE record, relabelled.
   *
   * Same story as Function: the `shift_types` picker had five options and
   * nobody assigned to it, while worker type was set for all 29 people. The
   * empty one went; this is the populated one under the kept name.
   *
   * ⚠ WORTH KNOWING: worker type is also the app's single branch point for PAY
   * BASIS (lib/attendance/worker-type.ts) — Full Time is a monthly CTC, the
   * rest are hourly. The workspace states that beside the field; here it is
   * only displayed.
   */
  { key: "shift", label: "Shift Type", default: true, value: (r) => t(workerTypeLabel(r.workerType)), sort: (r) => workerTypeLabel(r.workerType) },
  { key: "status", label: "Status", default: true, value: (r) => r.status, sort: (r) => r.status.replace(/_/g, " ") },
  // Optional — available under Columns, off by default so the table stays compact.
  { key: "manager", label: "Manager", default: false, value: (r) => t(r.managerName), sort: (r) => r.managerName },
  { key: "teamLead", label: "Team Lead", default: false, value: (r) => yn(r.isTeamLead), sort: (r) => (r.isTeamLead ? 1 : 0) },
  { key: "trainPass", label: "Train Pass", default: false, value: (r) => yn(r.trainPass), sort: (r) => (r.trainPass ? 1 : 0) },
  { key: "doc", label: "DOC", default: false, value: (r) => ymd(r.dateOfCompletion), sort: (r) => dateSortValue(r.dateOfCompletion) },
  { key: "personalEmail", label: "Personal Mail", default: false, value: (r) => t(r.personalEmail), sort: (r) => r.personalEmail },
  { key: "phone", label: "Personal Cell", default: false, value: (r) => t(r.phone), sort: (r) => r.phone },
  { key: "tds", label: "Monthly TDS", default: false, numeric: true, pay: true, value: (r) => inr(r.tdsMonthly), sort: (r) => r.tdsMonthly },
  { key: "ptExempt", label: "PT Exempt", default: false, value: (r) => (r.ptExempt == null ? DASH : yn(r.ptExempt)), sort: (r) => r.ptExempt == null ? null : r.ptExempt ? 1 : 0 },
  {
    key: "backgroundCheck",
    label: "Background Check",
    default: false,
    value: (r) => (r.backgroundCheck === "yes" ? "Done" : r.backgroundCheck === "no" ? "Not Done" : DASH),
    sort: (r) => r.backgroundCheck,
  },
];

/**
 * Column preferences persist per user, in localStorage.
 *
 * The same mechanism the Tasks table already uses (`components/tasks/task-table.tsx`)
 * rather than a new preferences table — the brief asks to persist "if the
 * existing application already supports persistent table column configuration",
 * and this is what it supports. Wrapped in try/catch throughout: private mode
 * and blocked site data both throw on access, and a column preference is never
 * worth failing a render for.
 */
const COLUMN_KEY = "wms:employee-master:columns:v1";

function loadColumnPrefs(): ColumnKey[] | null {
  try {
    const raw = localStorage.getItem(COLUMN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = new Set(COLUMNS.map((c) => c.key as string));
    return parsed.filter((k): k is ColumnKey => typeof k === "string" && valid.has(k));
  } catch {
    return null;
  }
}

function saveColumnPrefs(keys: ColumnKey[]): void {
  try {
    localStorage.setItem(COLUMN_KEY, JSON.stringify(keys));
  } catch {
    /* storage unavailable — the session still works, it just will not remember */
  }
}

/* ── Filters ──────────────────────────────────────────────────────────────── */

interface FilterState {
  entityId: string;
  designationId: string;
  departmentId: string;
  managerId: string;
  workerType: string;
  status: string;
  teamLead: string; // "" | "yes" | "no"
  trainPass: string;
  ptExempt: string;
  probation: string; // "" | "on" | "off"
  hasCode: string; // "" | "yes" | "no"
  dojFrom: string;
  dojTo: string;
}

const NO_FILTERS: FilterState = {
  entityId: "", designationId: "", departmentId: "",
  managerId: "", workerType: "", status: "", teamLead: "", trainPass: "", ptExempt: "",
  probation: "", hasCode: "", dojFrom: "", dojTo: "",
};

function activeFilterCount(f: FilterState): number {
  return Object.values(f).filter(Boolean).length;
}

const bool3 = (v: string, actual: boolean | null): boolean =>
  v === "" || (v === "yes" ? actual === true : actual === false);

type KpiFilter = "confirmed" | "probation" | "employees" | "full_time_interns" | "part_time_interns" | "interns";

function isActiveWorkforce(row: EmployeeMasterRow): boolean {
  return row.isActive && row.employmentStatus === "active" && !row.onTemporaryBreak;
}

function matchesKpi(row: EmployeeMasterRow, filter: KpiFilter): boolean {
  if (!isActiveWorkforce(row)) return false;
  const intern = row.effectiveEmployeeType === "intern";
  switch (filter) {
    case "confirmed": return !intern && !row.onProbation;
    case "probation": return !intern && row.onProbation;
    case "employees": return !intern;
    case "fullTimeInterns": return intern && row.workerType === "full_time";
    case "partTimeInterns": return intern && row.workerType !== "full_time";
    case "interns": return intern;
  }
}

/* ── The component ────────────────────────────────────────────────────────── */

export function EmployeeMasterTable({
  rows,
  options,
  canSeePay,
  canDelete,
  currentUserId,
}: {
  rows: EmployeeMasterRow[];
  options: MasterOptions;
  canSeePay: boolean;
  canDelete: boolean;
  currentUserId: string;
}) {
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState<FilterState>(NO_FILTERS);
  const [statusTab, setStatusTab] = React.useState<EmployeeStatusTab>("all");
  const [kpiFilter, setKpiFilter] = React.useState<KpiFilter | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  // Which columns are available at all. A viewer without pay access never even
  // sees the CTC toggle — offering a control for data the server withheld would
  // promise something it cannot deliver.
  const available = React.useMemo(
    () => COLUMNS.filter((c) => canSeePay || !c.pay),
    [canSeePay],
  );

  const [visibleKeys, setVisibleKeys] = React.useState<ColumnKey[]>(() =>
    available.filter((c) => c.default).map((c) => c.key),
  );

  // Preferences are read AFTER mount, never during render: localStorage does not
  // exist on the server, and reading it in a useState initialiser makes the
  // first client render disagree with the server's and throws a hydration error.
  React.useEffect(() => {
    const saved = loadColumnPrefs();
    if (!saved || saved.length === 0) return;
    const allowed = new Set(available.map((c) => c.key as string));
    const kept = saved.filter((k) => allowed.has(k));
    /* Reading a stored preference is exactly the "subscribe to an external
       system" case an effect exists for, and it cannot move into the useState
       initialiser: `localStorage` does not exist during the server render, so
       seeding state from it would make the first client render disagree with
       the delivered HTML and throw a hydration error. One extra render on
       mount is the correct trade for correct hydration. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (kept.length > 0) setVisibleKeys(kept);
  }, [available]);

  const columns = React.useMemo(
    () => available.filter((c) => c.key === "employee" || visibleKeys.includes(c.key)),
    [available, visibleKeys],
  );

  function toggleColumn(key: ColumnKey) {
    if (key === "employee") return;
    setVisibleKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      // Never let the table become headless. "Employee Details" is the row's
      // identity — without it a row cannot be recognised or clicked with intent.
      const safe = next.length === 0 ? (["employee"] as ColumnKey[]) : next;
      saveColumnPrefs(safe);
      return safe;
    });
  }

  /**
   * How many people each tab holds.
   *
   * Counted over the WHOLE roster rather than the filtered view, so the
   * numbers answer "how many people are on probation" and not "how many are
   * on probation among the rows currently showing" — which would change
   * under you as you typed in the search box.
   *
   * Computed with `matchesStatusTab`, the same function the filter below
   * calls, so a tab cannot advertise a count it then fails to show.
   */
  const statusCounts = React.useMemo(() => {
    const out = { all: 0, current: 0, probation: 0, past: 0 } as Record<EmployeeStatusTab, number>;
    for (const tab of EMPLOYEE_STATUS_TABS) {
      out[tab] = rows.filter((r) => matchesStatusTab(r.status, tab)).length;
    }
    return out;
  }, [rows]);

  const kpis = React.useMemo(() => {
    const active = rows.filter(isActiveWorkforce);
    const confirmed = active.filter((row) => row.status === "active").length;
    const probation = active.filter((row) => row.status === "probation").length;
    const fullTimeInterns = active.filter(
      (row) => row.effectiveEmployeeType === "intern" && row.workerType === "full_time",
    ).length;
    const partTimeInterns = active.filter(
      (row) => row.effectiveEmployeeType === "intern" && row.workerType !== "full_time",
    ).length;
    return [
      { key: "employees" as const, label: "Total Employees", value: confirmed + probation, tone: "#1d4ed8", icon: Users },
      { key: "confirmed" as const, label: "Confirmed Employees", value: confirmed, tone: "#15803d", icon: BadgeCheck },
      { key: "probation" as const, label: "On Probation", value: probation, tone: "#b45309", icon: Clock3 },
      { key: "interns" as const, label: "Total Interns", value: fullTimeInterns + partTimeInterns, tone: "#7e22ce", icon: GraduationCap },
      { key: "full_time_interns" as const, label: "Full-Time Interns", value: fullTimeInterns, tone: "#0f766e", icon: Sun },
      { key: "part_time_interns" as const, label: "Part-Time Interns", value: partTimeInterns, tone: "#475569", icon: Moon },
    ];
  }, [rows]);

  /* ── search + filter + sort ────────────────────────────────────────────── */

  const view = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q) {
        // Searched across the fields somebody would actually type: name, code,
        // both mails, phone and the three master labels.
        const hay = [
          r.name, r.employeeCode, r.officeEmail, r.personalEmail, r.phone,
          r.designationName, r.entityName, r.departmentName,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // The segmented control first: it is the coarsest cut and the one the
      // viewer can see, so anything it excludes is excluded regardless of what
      // the Filters panel says.
      if (!matchesStatusTab(r.status, statusTab)) return false;
      if (kpiFilter && !matchesKpi(r, kpiFilter)) return false;
      const f = filters;
      if (f.entityId && r.entityId !== f.entityId) return false;
      if (f.designationId && r.designationId !== f.designationId) return false;
      if (f.departmentId && r.departmentId !== f.departmentId) return false;
      if (f.managerId && r.managerId !== f.managerId) return false;
      if (f.workerType && r.workerType !== f.workerType) return false;
      if (f.status && r.status !== f.status) return false;
      if (!bool3(f.teamLead, r.isTeamLead)) return false;
      if (!bool3(f.trainPass, r.trainPass)) return false;
      if (!bool3(f.ptExempt, r.ptExempt)) return false;
      if (f.probation && (f.probation === "on") !== r.onProbation) return false;
      if (f.hasCode && (f.hasCode === "yes") !== !!r.employeeCode) return false;
      if (f.dojFrom || f.dojTo) {
        const d = r.joinedAt ? new Date(r.joinedAt).toISOString().slice(0, 10) : "";
        if (!d) return false;
        if (f.dojFrom && d < f.dojFrom) return false;
        if (f.dojTo && d > f.dojTo) return false;
      }
      return true;
    });

    const col = sortKey ? COLUMNS.find((c) => c.key === sortKey) : undefined;
    if (col?.sort) {
      const get = col.sort;
      out = [...out].sort((a, b) => {
        const av = get(a), bv = get(b);
        const aEmpty = av == null || av === "";
        const bEmpty = bv == null || bv === "";
        const cmp = aEmpty || bEmpty
          ? aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
          : typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
        // Name is the tie-break on every ordering, so rows that compare equal
        // never reshuffle between renders.
        const ordered = aEmpty || bEmpty ? cmp : sortDir === "asc" ? cmp : -cmp;
        return ordered || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }
    return out;
  }, [rows, query, filters, statusTab, kpiFilter, sortKey, sortDir]);

  /**
   * THE EFFECTIVE SELECTION IS DERIVED, not stored.
   *
   * Only rows currently in view can be selected. Acting on a hidden selection is
   * the classic bulk-action accident — filter to Sales, "select all", clear the
   * filter, click Archive, and the whole roster goes — so the intersection is
   * computed during render rather than written back into state by an effect.
   * Narrowing the filter therefore drops those rows from every count, every
   * button and every request, with no render in between where they still count.
   *
   * `selected` keeps the raw ids so widening the filter again restores them,
   * which is what someone who bumped a filter by mistake expects.
   */
  const selectedRows = React.useMemo(
    () => view.filter((r) => selected.has(r.id)),
    [view, selected],
  );
  const selectedCount = selectedRows.length;
  const allVisibleSelected = view.length > 0 && selectedCount === view.length;

  /**
   * Who could inherit an offboarded employee's open work.
   *
   * Built from `rows` (the whole roster) rather than `view` (what the filters
   * currently show), because the right successor is frequently not on screen —
   * you search for one person in order to offboard them, and the colleague who
   * takes over their tasks is filtered out by that same search.
   */
  const successorOptions = React.useMemo(
    () =>
      rows
        .filter((r) => r.isActive)
        .map((r) => ({ value: r.id, label: r.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows],
  );

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(view.map((r) => r.id)));
  }

  function sortBy(key: ColumnKey) {
    if (!COLUMNS.find((c) => c.key === key)?.sort) return;
    if (key === sortKey) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    }
    else { setSortKey(key); setSortDir("asc"); }
  }

  /** CSV of the FILTERED, VISIBLE view — what you see is what you export. */
  function exportCsv() {
    const header = columns.map((c) => c.label);
    const body = view.map((r) => columns.map((c) => c.value(r)));
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...body].map((line) => line.map(esc).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employee-master-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const nFilters = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto" role="group" aria-label="Employee workforce KPIs">
        <div className="grid min-w-[930px] grid-cols-6 gap-2">
        {kpis.map((kpi) => {
          const active = kpiFilter === kpi.key;
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.key}
              type="button"
              aria-pressed={active}
              onClick={() => setKpiFilter((current) => current === kpi.key ? null : kpi.key)}
              className={cn(
                "min-w-0 rounded-2xl border px-3 py-3 text-left transition-all duration-150 hover:-translate-y-0.5",
                active ? "ring-2 ring-altus-red ring-offset-1" : "hover:border-hairline-strong",
              )}
              style={{
                borderColor: active ? kpi.tone : "var(--color-hairline)",
                background: active ? `color-mix(in srgb, ${kpi.tone} 8%, var(--color-surface-card))` : "var(--color-surface-card)",
              }}
            >
              <span className="flex items-center gap-2">
                <span className="inline-grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${kpi.tone} 10%, transparent)`, color: kpi.tone }}>
                  <Icon size={15} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 text-[9px] font-black uppercase leading-tight tracking-[0.07em]" style={{ color: kpi.tone }}>{kpi.label}</span>
              </span>
              <span className="mt-2 block text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums text-ink-strong">{kpi.value}</span>
            </button>
          );
        })}
        </div>
      </div>
      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-[380px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code, email, phone…"
            aria-label="Search employees"
            className="w-full rounded-lg border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-altus-red"
          />
        </div>

        <Control active={filtersOpen || nFilters > 0} onClick={() => setFiltersOpen((v) => !v)}>
          <Filter size={14} /> Filters
          {nFilters > 0 && (
            <span className="ml-1 rounded-pill bg-altus-red px-1.5 text-[10px] font-bold text-white">{nFilters}</span>
          )}
        </Control>

        <Control active={columnsOpen} onClick={() => setColumnsOpen((v) => !v)}>
          <Columns3 size={14} /> Columns
        </Control>

        <Control onClick={exportCsv}>
          <Download size={14} /> Export
        </Control>

        {/* EMPLOYEE STATUS — four visible buttons rather than a dropdown,
            filling the toolbar span that was empty. The counts read from the
            SAME predicate that filters the table, so a tab can never show a
            number it does not then display. */}
        <div role="group" aria-label="Employee status" className="flex items-center gap-1 rounded-lg border border-hairline-strong bg-white p-0.5">
          <span className="px-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
            Status
          </span>
          {EMPLOYEE_STATUS_TABS.map((tab) => {
            const active = statusTab === tab;
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusTab(tab)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                  active
                    ? "bg-altus-red text-white"
                    : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong",
                )}
              >
                {EMPLOYEE_STATUS_LABELS[tab]}
                <span className={cn("ml-1.5 tabular-nums", active ? "opacity-80" : "text-ink-subtle")}>
                  {statusCounts[tab]}
                </span>
              </button>
            );
          })}
        </div>

        <span className="ml-auto text-[12.5px] text-ink-muted">
          {view.length === rows.length
            ? `${rows.length} employees`
            : `${view.length} of ${rows.length}`}
        </span>
      </div>

      {columnsOpen && (
        <Panel onClose={() => setColumnsOpen(false)} label="Columns">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-4">
            {available.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={c.key === "employee" || visibleKeys.includes(c.key)}
                  onChange={() => toggleColumn(c.key)}
                  disabled={c.key === "employee"}
                  className="size-3.5 accent-[var(--color-altus-red)]"
                />
                {c.label}
              </label>
            ))}
          </div>
        </Panel>
      )}

      {filtersOpen && (
        <Panel
          onClose={() => setFiltersOpen(false)}
          label="Filters"
          action={
            nFilters > 0 ? (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-[12px] font-semibold text-altus-red hover:underline">
                Clear all
              </button>
            ) : null
          }
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Select label="Entity" value={filters.entityId} onChange={(v) => setFilters((f) => ({ ...f, entityId: v }))} options={options.entities} />
            <Select label="Designation" value={filters.designationId} onChange={(v) => setFilters((f) => ({ ...f, designationId: v }))} options={options.designations} />
            {/* The Department record, under its new name. */}
            <Select label="Function" value={filters.departmentId} onChange={(v) => setFilters((f) => ({ ...f, departmentId: v }))} options={options.departments} />
            <Select label="Manager" value={filters.managerId} onChange={(v) => setFilters((f) => ({ ...f, managerId: v }))} options={options.managers} />
            {/* The worker-type record, under its new name, with real labels
                rather than the raw enum values the old filter showed. */}
            <Select label="Shift Type" value={filters.workerType} onChange={(v) => setFilters((f) => ({ ...f, workerType: v }))}
              options={EMPLOYEE_TYPE_OPTIONS.map((w) => ({ id: w, name: WORKER_TYPE_LABELS[w] }))} />
            <Select label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              options={["active", "probation", "temporary_break", "inactive", "offboarded"].map((s) => ({ id: s, name: s.replace(/_/g, " ") }))} />
            <Select label="Team Lead" value={filters.teamLead} onChange={(v) => setFilters((f) => ({ ...f, teamLead: v }))} options={YES_NO} />
            <Select label="Train Pass" value={filters.trainPass} onChange={(v) => setFilters((f) => ({ ...f, trainPass: v }))} options={YES_NO} />
            {canSeePay && (
              <Select label="PT Exempt" value={filters.ptExempt} onChange={(v) => setFilters((f) => ({ ...f, ptExempt: v }))} options={YES_NO} />
            )}
            <Select label="Probation" value={filters.probation} onChange={(v) => setFilters((f) => ({ ...f, probation: v }))}
              options={[{ id: "on", name: "On probation" }, { id: "off", name: "Not on probation" }]} />
            <Select label="Employee Code" value={filters.hasCode} onChange={(v) => setFilters((f) => ({ ...f, hasCode: v }))}
              options={[{ id: "yes", name: "Has a code" }, { id: "no", name: "No code yet" }]} />
            <DateField label="DOJ from" value={filters.dojFrom} onChange={(v) => setFilters((f) => ({ ...f, dojFrom: v }))} />
            <DateField label="DOJ to" value={filters.dojTo} onChange={(v) => setFilters((f) => ({ ...f, dojTo: v }))} />
          </div>
        </Panel>
      )}

      {/* ── Bulk bar ────────────────────────────────────────────────────── */}
      {selectedCount > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-hairline-strong bg-white px-3 py-2 shadow-md">
          <span className="text-[13px] font-bold text-ink-strong">
            {selectedCount} employee{selectedCount === 1 ? "" : "s"} selected
          </span>
          <button type="button" onClick={() => setBulkOpen(true)} className="rounded-lg bg-altus-red px-3 py-1.5 text-[12.5px] font-bold text-white">
            Bulk Edit
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="rounded-lg border border-hairline-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong">
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="min-w-[1450px] border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft">
              <th
                scope="col"
                className="sticky left-0 z-30 w-9 bg-surface-soft px-2 py-2"
                style={{ width: EMPLOYEE_SELECT_WIDTH, minWidth: EMPLOYEE_SELECT_WIDTH, maxWidth: EMPLOYEE_SELECT_WIDTH }}
              >
                <input
                  type="checkbox"
                  aria-label="Select all visible employees"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  className="size-3.5 accent-[var(--color-altus-red)]"
                />
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  onClick={() => sortBy(c.key)}
                  aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  className={`select-none px-2.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted ${c.key === "employee" ? "sticky left-9 z-30 min-w-[220px] bg-surface-soft" : c.key === "employeeCode" ? "sticky z-30 border-r border-hairline bg-surface-soft shadow-[4px_0_7px_-4px_rgba(15,23,42,0.22)]" : ""} ${c.numeric ? "text-right" : "text-left"} ${c.sort ? "cursor-pointer hover:text-ink-strong" : ""}`}
                  style={c.key === "employee" ? {
                    left: EMPLOYEE_SELECT_WIDTH,
                    width: EMPLOYEE_DETAILS_WIDTH,
                    minWidth: EMPLOYEE_DETAILS_WIDTH,
                    maxWidth: EMPLOYEE_DETAILS_WIDTH,
                  } : c.key === "employeeCode" ? {
                    left: EMPLOYEE_CODE_LEFT,
                    width: EMPLOYEE_CODE_WIDTH,
                    minWidth: EMPLOYEE_CODE_WIDTH,
                    maxWidth: EMPLOYEE_CODE_WIDTH,
                  } : undefined}
                >
                  {c.label}
                  {sortKey === c.key && <span aria-hidden className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
              <th className="w-10 px-2 py-2"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-[13px] text-ink-muted">
                  No employees match this search or filter.
                </td>
              </tr>
            )}
            {view.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="group cursor-pointer border-b border-hairline/60 transition-colors hover:bg-surface-soft"
              >
                <td
                  className="sticky left-0 z-10 w-9 bg-white px-2 py-1.5 group-hover:bg-surface-soft"
                  style={{ width: EMPLOYEE_SELECT_WIDTH, minWidth: EMPLOYEE_SELECT_WIDTH, maxWidth: EMPLOYEE_SELECT_WIDTH }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleRow(r.id)}
                    className="size-3.5 accent-[var(--color-altus-red)]"
                  />
                </td>
                {columns.map((c) =>
                  c.key === "employee" ? (
                    <td
                      key={c.key}
                      className="sticky left-9 z-20 min-w-[220px] bg-white px-2.5 py-1.5 group-hover:bg-surface-soft"
                      style={{
                        left: EMPLOYEE_SELECT_WIDTH,
                        width: EMPLOYEE_DETAILS_WIDTH,
                        minWidth: EMPLOYEE_DETAILS_WIDTH,
                        maxWidth: EMPLOYEE_DETAILS_WIDTH,
                      }}
                    >
                      <EmployeeCell row={r} />
                    </td>
                  ) : c.key === "employeeCode" ? (
                    <td
                      key={c.key}
                      className="sticky z-20 border-r border-hairline bg-white px-2.5 py-1.5 text-[12.5px] text-ink-soft shadow-[4px_0_7px_-4px_rgba(15,23,42,0.22)] group-hover:bg-surface-soft"
                      style={{
                        left: EMPLOYEE_CODE_LEFT,
                        width: EMPLOYEE_CODE_WIDTH,
                        minWidth: EMPLOYEE_CODE_WIDTH,
                        maxWidth: EMPLOYEE_CODE_WIDTH,
                      }}
                    >
                      {c.value(r)}
                    </td>
                  ) : c.key === "status" ? (
                    <td key={c.key} className="px-2.5 py-1.5">
                      <StatusPill status={r.status} />
                    </td>
                  ) : (
                    <td
                      key={c.key}
                      className={`px-2.5 py-1.5 text-[12.5px] ${c.key === "doj" ? "whitespace-nowrap" : ""} ${c.numeric ? "text-right tabular-nums" : ""} text-ink-soft`}
                    >
                      {c.render ? c.render(r) : c.value(r)}
                    </td>
                  ),
                )}
                {/* The row-end cell was a decorative chevron that only repeated
                    what the whole row already does (click to open). It now
                    carries the per-employee actions (§15) — the same set the
                    Employees screen offers, calling the same server actions. */}
                <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <MasterRowActions
                    employee={{
                      id: r.id,
                      name: r.name,
                      email: r.officeEmail,
                      joinedAt: r.joinedAt,
                      isActive: r.isActive,
                    }}
                    isSelf={r.id === currentUserId}
                    canSetLegalHold={canDelete}
                    successorOptions={successorOptions}
                    onEdit={() => setOpenId(r.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && (
        <EmployeeWorkspace
          key={openId}
          employeeId={openId}
          options={options}
          canSeePay={canSeePay}
          canDelete={canDelete}
          currentUserId={currentUserId}
          onClose={() => setOpenId(null)}
        />
      )}

      {bulkOpen && (
        <BulkEditDialog
          employees={selectedRows}
          options={options}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

const YES_NO = [{ id: "yes", name: "Yes" }, { id: "no", name: "No" }];

/**
 * The Employee Details cell (§2), exactly as specified: a status dot, the name,
 * the code with a Probation tag beside it, then the office mail.
 */
function EmployeeCell({ row }: { row: EmployeeMasterRow }) {
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-[6px] size-[7px] shrink-0 rounded-full"
        style={{ background: statusColour(row.status) }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-bold text-ink-strong">{row.name}</span>
          {row.onProbation && (
            <span className="shrink-0 rounded px-1 py-px text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "var(--color-amber-bg, #fef3e2)", color: "var(--color-amber-deep, #b45309)" }}>
              Probation
            </span>
          )}
        </div>
        {/* The employee code is NOT repeated here — it has its own column now.
            Two copies of one value in one row is noise, and the one in the
            column is the sortable, exportable one. */}
        <div className="truncate text-[11.5px] text-ink-subtle">{row.officeEmail}</div>
      </div>
    </div>
  );
}

function statusColour(status: string): string {
  return status === "active" ? "#15803d"
    : status === "probation" ? "#b45309"
    : status === "temporary_break" ? "#6b7280"
    : status === "inactive" ? "#9ca3af"
    : "#6b7280";
}

function StatusPill({ status }: { status: string }) {
  const bg = status === "active" ? "#e9f7ef" : status === "probation" ? "#fef3e2" : "#f1f2f4";
  return (
    <span className="inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold capitalize"
      style={{ background: bg, color: statusColour(status) }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Control({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-semibold transition-colors ${
        active ? "border-altus-red text-altus-red" : "border-hairline-strong text-ink-muted hover:text-ink-strong"
      }`}
    >
      {children}
    </button>
  );
}

function Panel({ children, onClose, label, action }: { children: React.ReactNode; onClose: () => void; label: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline-strong bg-surface-soft px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{label}</span>
        {action}
        <button type="button" onClick={onClose} aria-label={`Close ${label}`} className="ml-auto text-ink-subtle hover:text-ink-strong">
          <X size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-[12.5px] capitalize outline-none focus:border-altus-red"
      >
        <option value="">Any</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-ink-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-altus-red"
      />
    </label>
  );
}
