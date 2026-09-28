"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { ApproverChip } from "@/components/status/approver-chip";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { COMPLIANCE_APPROVER_LABEL, DOER_STATUSES, doerLabel, doerStyle, isDoerStatus, type DoerStatus } from "@/lib/compliance/status";
import { addDays, formatDeadline, shortDay, type ComplianceKind } from "@/lib/compliance/schedule";
import { MAX_QUANTITY, checkQuantity, quantityText, targetFromTitle, type QuantityTarget } from "@/lib/compliance/quantity";
import { MINUTES_WORDS, hoursText, minutesText, parseMinutes, totalMinutes } from "@/lib/compliance/minutes";
import { COMPLIANCE_PERIOD_STATUSES, compliancePeriodKey, compliancePeriodTone, type CompliancePeriodColumn } from "@/lib/compliance/period-checks";
import {
  DEADLINES_PER_MONTH,
  MCC_FREQUENCIES,
  MCC_FREQUENCY_LABEL,
  MONTH_END,
  MONTH_LONG,
  deadlineDayText,
  defaultDays,
  mccDetail,
  needsStartMonth,
  normalizeMccSchedule,
  type MccFrequency,
} from "@/lib/compliance/mcc-frequency";
import { ComplianceBulkUpload } from "@/components/compliance/compliance-bulk-upload";
import type { ComplianceRow } from "@/lib/compliance/rows";
import {
  COLUMNS,
  DEFAULT_ORDER,
  columnDef,
  columnLabel,
  moveColumn,
  reconcileOrder,
  sortRows,
  visibleColumns,
  type ColKey,
  type ColumnDef,
} from "@/lib/compliance/columns";
import { ariaSort, directionWords, nextSort, type SortState } from "@/lib/ui/column-sort";
import type { BoardGroup, ManageablePerson } from "@/lib/queries/compliance-board";
import type { CompliancePeriodCheck } from "@/lib/queries/compliance-period-checks";
import {
  archiveComplianceItem,
  archiveComplianceItems,
  saveComplianceItem,
  setComplianceApprover,
  setComplianceDoer,
  setComplianceMinutes,
  setCompliancePeriodCheck,
} from "@/app/(app)/dcc/compliance-actions";
import { useAutoHeight } from "@/components/ui/use-auto-height";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * THE WCC / MCC TABLE — the Accounts checklist's shape with the WMS columns
 * (account holder, 2026-09-18):
 *
 *   S. No. · [Employee] · Compliance · Frequency · Mins (WCC) or Deadline
 *   (MCC) · Doer Status · Quantity Done · Actual Date · +/- Days · Approver
 *   Status · Doer Notes · Approver Notes
 *
 * MCC's Frequency is the day of the month alone — a red "2nd", "30th" pill,
 * the frequency in words on hover (lib/compliance/columns.ts).
 *
 * WCC groups its rows Daily first, then each day of the week — a Mon & Wed
 * compliance under Monday and again under Wednesday, two compliances
 * (lib/compliance/wcc-groups.ts; account holder, 2026-09-19) — so each group
 * carries its day and WCC has no Deadline column. In its place, MINS: how long
 * each compliance takes. A group's heading is its name alone, with its Mins
 * added up under the Mins column; the foot of the table totals the view
 * (lib/compliance/minutes.ts). The team view keeps its teams, each divided
 * the same way.
 *
 * Quantity Done is for a compliance that counts ("Send 25 emails" — see
 * lib/compliance/quantity.ts): picking Done asks how many were completed, and
 * the count can be corrected from its cell while the row stays Done.
 *
 * MCC's Deadline and the Actual Date read DD-MMM-YYYY. The actual date is the
 * day the doer marked it Done, stamped by the server; +/- days is that against
 * the deadline, and a row still open past its deadline counts its lateness up.
 *
 * A row not Done by its day is CARRIED FORWARD — open, marked in amber, in
 * WCC's Today view — until it LAPSES and freezes (lib/compliance/schedule.ts):
 * a daily one after its own day, one on chosen days by the next chosen day or
 * Sunday, an MCC one by its next deadline or month-end.
 *
 * Every cell saves on its own (on change, or on blur for notes) — several
 * people fill one team's checklist, and a whole-form Save would lose one
 * person's work to another's.
 *
 * Like the Tasks table, every heading sorts (ascending, descending, off) and
 * every column can be dragged by its grip to anywhere in the row — each
 * person's order is kept in their browser (lib/compliance/columns.ts).
 */

export interface ComplianceBoardProps {
  kind: ComplianceKind;
  rows: ComplianceRow[];
  groups: BoardGroup[];
  multiPerson: boolean;
  /** People the viewer may add a compliance for. */
  manageable: ManageablePerson[];
  /** Whose compliance a new one defaults to. */
  defaultOwnerId: string;
  today: string;
  /** Who is looking — their column order is saved under their id. */
  viewerId: string;
  /**
   * Status chips to open already pressed, and a search to open already typed —
   * both from the URL, so the Compliance Dashboard can hand you the exact rows
   * behind a figure you clicked.
   *
   * SEEDS, not controlled values: once the board is open the chips are yours,
   * and clicking one must not have to round-trip through the router. Unknown
   * keys are dropped rather than trusted (`asStatusFilter`) — a hand-edited
   * `?status=` should show everything, never nothing.
   */
  initialStatuses?: readonly string[];
  initialQuery?: string;
  /** Accounts-style Wk1–Wk5 / Apr–Mar period columns. */
  periodColumns?: readonly CompliancePeriodColumn[];
  periodChecks?: readonly CompliancePeriodCheck[];
}

/** A heading pinned to the top of the scroll box, as the Tasks table's read:
 *  the words in full, in Title Case ("Approver Status"), bold and slightly
 *  spaced. The line under it is a shadow, because a border on a sticky cell
 *  stays behind in a collapsed table. */
const HEAD =
  "group/head sticky top-0 z-20 bg-surface-soft px-3 py-2.5 text-left text-[13px] font-bold tracking-[0.02em] normal-case text-ink-soft whitespace-nowrap";

/** The compliance table's identity rail. Selection is frozen with the two
 * requested columns so checking a row remains possible after horizontal scroll. */
const FROZEN_LEFT: readonly ColKey[] = ["select", "sr", "compliance", "section"];

function reconcilePeriodOrder(saved: unknown, periods: readonly CompliancePeriodColumn[]) {
  const keys = periods.map((period) => period.key);
  if (!Array.isArray(saved)) return keys;
  const known = saved.filter((key): key is string => typeof key === "string" && keys.includes(key));
  return [...known, ...keys.filter((key) => !known.includes(key))];
}

function movePeriodColumn(order: readonly string[], dragged: string, target: string) {
  const from = order.indexOf(dragged);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}

function frozenLeftOffsets(cols: readonly ColKey[], kind: ComplianceKind): Partial<Record<ColKey, number>> {
  const offsets: Partial<Record<ColKey, number>> = {};
  let left = 0;
  for (const col of cols) {
    if (!FROZEN_LEFT.includes(col)) continue;
    offsets[col] = left;
    left += columnDef(col, kind).width;
  }
  return offsets;
}

export function ComplianceBoard({
  kind,
  rows,
  groups,
  multiPerson,
  manageable,
  defaultOwnerId,
  today,
  viewerId,
  initialStatuses,
  initialQuery,
  periodColumns = [],
  periodChecks = [],
}: ComplianceBoardProps) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQuery ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ComplianceRow | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  /* The status chips are filters — any number of them at once. Empty = all. */
  const [statuses, setStatuses] = React.useState<Set<StatusFilter>>(
    () => new Set((initialStatuses ?? []).map(asStatusFilter).filter((k): k is StatusFilter => k !== null)),
  );
  /* Which groups start open: every one for one person; for a whole team —
     thousands of cells — only the first. A click is kept as a difference from
     that, so the groups of a month or week stepped to arrive open too. */
  const [toggled, setToggled] = React.useState<Set<string>>(() => new Set());

  /* ── Sort: ascending → descending → the checklist's own order ─────────────
     Not remembered: a sort is how you read the list for a minute. */
  const [sort, setSort] = React.useState<SortState<ColKey>>(null);

  /* ── Column order, dragged by each person, saved in their browser ────────
     Per employee and per checklist, as the Tasks table keeps its own. Read
     after mount: localStorage does not exist during the server render. */
  const orderKey = `altus.compliance.columnOrder.v1:${kind}:${viewerId}`;
  const [order, setOrder] = React.useState<ColKey[]>(DEFAULT_ORDER);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(orderKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists after mount; see above.
      if (raw) setOrder(reconcileOrder(JSON.parse(raw) as string[]));
    } catch {
      /* nothing stored, or storage blocked — the default order stands */
    }
  }, [orderKey]);
  const saveOrder = (next: ColKey[]) => {
    setOrder(next);
    try {
      window.localStorage.setItem(orderKey, JSON.stringify(next));
    } catch {
      /* not storable here — the order holds for this visit only */
    }
  };
  const [dragCol, setDragCol] = React.useState<ColKey | null>(null);
  const [dropCol, setDropCol] = React.useState<ColKey | null>(null);
  const periodOrderKey = `altus.compliance.periodColumnOrder.v1:${kind}:${viewerId}`;
  const periodKeyList = periodColumns.map((period) => period.key).join("|");
  const [periodOrder, setPeriodOrder] = React.useState<string[]>(() => periodColumns.map((period) => period.key));
  const [dragPeriod, setDragPeriod] = React.useState<string | null>(null);
  const [dropPeriod, setDropPeriod] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(periodOrderKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preference restore.
      setPeriodOrder(reconcilePeriodOrder(saved ? JSON.parse(saved) : null, periodColumns));
    } catch {
      setPeriodOrder(periodColumns.map((period) => period.key));
    }
  }, [periodOrderKey, periodKeyList]);
  const savePeriodOrder = (next: string[]) => {
    setPeriodOrder(next);
    try {
      window.localStorage.setItem(periodOrderKey, JSON.stringify(next));
    } catch {
      /* preference remains for this visit */
    }
  };
  const cols = visibleColumns(order, multiPerson, kind);
  const bodyCols = cols.filter((col) => col !== "delete");
  const hasDelete = cols.includes("delete");
  const orderedPeriodColumns = React.useMemo(() => {
    const byKey = new Map(periodColumns.map((period) => [period.key, period]));
    return reconcilePeriodOrder(periodOrder, periodColumns).map((key) => byKey.get(key)).filter((period): period is CompliancePeriodColumn => Boolean(period));
  }, [periodColumns, periodOrder]);
  const tableColumnCount = cols.length + orderedPeriodColumns.length;
  const tableWidth = cols.reduce((n, k) => n + columnDef(k, kind).width, 0) + orderedPeriodColumns.length * (kind === "wcc" ? 108 : 92);
  const frozenLeft = frozenLeftOffsets(cols, kind);
  const [periodOverrides, setPeriodOverrides] = React.useState<Map<string, string>>(() => new Map());
  const periodStatus = React.useMemo(() => {
    const values = new Map(periodChecks.map((check) => [compliancePeriodKey(check.itemId, check), check.status]));
    periodOverrides.forEach((status, key) => values.set(key, status));
    return values;
  }, [periodChecks, periodOverrides]);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  const byKey = React.useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const rowsOf = (keys: readonly string[]) => keys.map((k) => byKey.get(k)).filter((r): r is ComplianceRow => Boolean(r));
  /* S. No. belongs to the ROW — its place in the checklist — so sorting by it
     reads n…1, and a sort by anything else carries each row's number with it. */
  const serialOf = React.useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const g of groups) for (const k of g.rowKeys) m.set(k, ++n);
    return m;
  }, [groups]);
  const needle = q.trim().toLowerCase();
  const filtering = Boolean(needle) || statuses.size > 0;
  const matches = (r: ComplianceRow) =>
    (statuses.size === 0 || filterKeysOf(r).some((k) => statuses.has(k))) &&
    (!needle ||
      [r.title, r.section, r.ownerName, r.doerNotes, r.approverNotes].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const selectableKeys = rows.filter(matches).map((r) => r.key);
  const selectedVisible = selectableKeys.filter((key) => selected.has(key));
  const selectedRows = rows.filter((row) => selected.has(row.key));
  // A WCC item can appear once per due day, so removing selected occurrences
  // must still archive the underlying compliance exactly once.
  const selectedRemovableIds = [...new Set(selectedRows.filter((row) => row.canManage).map((row) => row.itemId))];
  const allVisibleSelected = selectableKeys.length > 0 && selectedVisible.length === selectableKeys.length;
  const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected;
  const toggleSelected = (key: string, next: boolean) =>
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  const toggleAllVisible = (next: boolean) =>
    setSelected((current) => {
      const updated = new Set(current);
      for (const key of selectableKeys) {
        if (next) updated.add(key);
        else updated.delete(key);
      }
      return updated;
    });
  const removeSelected = async () => {
    if (selectedRemovableIds.length === 0) return;
    const noun = selectedRemovableIds.length === 1 ? "compliance" : "compliances";
    if (!window.confirm(`Remove ${selectedRemovableIds.length} selected ${noun}? What was filled stays on record.`)) return;
    const ok = await run("bulk-delete", () => archiveComplianceItems(selectedRemovableIds));
    if (ok) setSelected(new Set());
  };
  const statusCounts = React.useMemo(() => {
    const m = new Map<StatusFilter, number>();
    for (const r of rows) for (const k of filterKeysOf(r)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [rows]);

  /** Save one cell; true when it saved (the count pop-up closes only then). */
  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) fireToast({ message: res.error ?? "That did not save.", type: "error" });
      else router.refresh();
      return res.ok;
    } finally {
      setBusy(null);
    }
  }

  const savePeriodStatus = async (itemId: string, period: CompliancePeriodColumn, status: string) => {
    const key = compliancePeriodKey(itemId, period);
    const before = periodStatus.get(key) ?? "";
    setPeriodOverrides((current) => new Map(current).set(key, status));
    const ok = await run(`period:${key}`, () => setCompliancePeriodCheck({
      itemId, kind, periodYear: period.periodYear, periodMonth: period.periodMonth, weekNo: period.weekNo, status,
    }));
    if (!ok) setPeriodOverrides((current) => new Map(current).set(key, before));
  };

  return (
    <section className="flex flex-col gap-4">
      {/* ONE LINE (account holder, 2026-09-19): the search, the status chips and
          the buttons side by side. Below 1680px the buttons shorten — Bulk
          upload to its icon, "Add compliance" to "Add" — so every chip fits a
          1366px laptop; where they still do not fit, the chips scroll sideways
          (the mouse wheel scrolls them too) rather than push the buttons onto
          a second line. Clear stays outside the scroll, always in view. */}
      <div className="flex items-center gap-3 max-md:flex-wrap">
        {/* The house search: a magnifier until clicked, the full field while
            open, a red dot on the magnifier while it is still filtering. */}
        <CollapsibleSearch scope={multiPerson ? "compliance, person, notes" : "compliance, notes"}>
          <div className="flex h-9 min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
            <Search size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={multiPerson ? "Search compliance, person, notes" : "Search compliance, notes"}
              aria-label="Search this checklist"
              className="w-full bg-transparent text-[14px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="shrink-0 rounded p-0.5 text-ink-subtle hover:text-ink-strong">
                <X size={14} />
              </button>
            )}
          </div>
        </CollapsibleSearch>
        <ChipStrip>
          <StatusFilters
            active={statuses}
            counts={statusCounts}
            onToggle={(s) =>
              setStatuses((cur) => {
                const n = new Set(cur);
                if (n.has(s)) n.delete(s);
                else n.add(s);
                return n;
              })
            }
          />
        </ChipStrip>
        {statuses.size > 0 && (
          <button
            type="button"
            onClick={() => setStatuses(new Set())}
            title="Show every status again"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-[3px] text-[11.5px] font-bold text-ink-soft hover:text-altus-red"
          >
            <X size={12} aria-hidden /> Clear
          </button>
        )}
        {manageable.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing("new")}
              aria-label="Add compliance"
              title="Add compliance"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-bold text-white min-[1680px]:px-3.5"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              <Plus size={15} strokeWidth={2.6} aria-hidden />
              <span className="min-[1680px]:hidden">Add</span>
              <span className="max-[1680px]:hidden">Add compliance</span>
            </button>
          </div>
        )}
      </div>

      {selectedVisible.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-altus-red/25 bg-surface-card px-3 py-2 shadow-sm"
          aria-label={`${selectedVisible.length} compliance${selectedVisible.length === 1 ? "" : "s"} selected`}
        >
          <span className="grid size-6 place-items-center rounded-full bg-altus-red text-[12px] font-black tabular-nums text-white">
            {selectedVisible.length}
          </span>
          <span className="mr-1 text-[13px] font-bold text-ink-strong">selected</span>
          <button
            type="button"
            disabled={busy !== null || selectedRemovableIds.length === 0}
            onClick={() => void removeSelected()}
            title={selectedRemovableIds.length > 0 ? "Delete selected compliances" : "Master compliances can only be removed from DCC Masters."}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-altus-red/35 bg-altus-red/5 px-3 text-[12.5px] font-bold text-altus-red hover:bg-altus-red/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={13} aria-hidden /> Delete{selectedRemovableIds.length > 0 ? ` ${selectedRemovableIds.length}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold text-ink-soft hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={13} aria-hidden /> Clear
          </button>
        </div>
      )}

      {manageable.length > 0 && <ComplianceBulkUpload open={bulkOpen} onOpenChange={setBulkOpen} kind={kind} people={manageable} />}

      <ItemDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        kind={kind}
        row={editing === "new" ? null : editing}
        manageable={manageable}
        defaultOwnerId={defaultOwnerId}
        onImport={() => {
          setEditing(null);
          setBulkOpen(true);
        }}
      />

      {/* What a sort is doing, and how to undo it. A person's column order needs
          no notice: it is theirs, and simply stays as they left it. */}
      {sort && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-surface-soft px-3.5 py-2 text-[12.5px] text-ink-soft">
          <ArrowUpDown size={14} className="shrink-0 text-ink-subtle" />
          <span>
            Sorted by <b className="font-semibold text-ink-strong">{columnLabel(sort.key, kind)}</b> (
            {directionWords(sort.dir, columnDef(sort.key, kind).sortKind)}) within each group
          </span>
          <button type="button" onClick={() => setSort(null)} className="ml-auto rounded-lg border border-hairline-strong bg-white px-2.5 py-1 text-[12px] font-bold text-ink-soft hover:text-ink-strong">
            Back to checklist order
          </button>
        </div>
      )}

      {/* Its own scroll box, both ways — the sideways scrollbar stays on screen
          instead of under the last row, and the headings stay pinned. */}
      <div
        className="table-scroll table-scroll-bold overflow-auto rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", maxHeight: "max(420px, calc(100vh - 260px))" }}
      >
        <table
          className="border-separate border-spacing-0 text-left"
          style={{ tableLayout: "fixed", width: tableWidth }}
        >
          <colgroup>
            {bodyCols.map((k) => (
              <col key={k} style={{ width: columnDef(k, kind).width }} />
            ))}
            {orderedPeriodColumns.map((period) => <col key={period.key} style={{ width: kind === "wcc" ? 108 : 92 }} />)}
            {hasDelete && <col style={{ width: columnDef("delete", kind).width }} />}
          </colgroup>
          <thead>
            <tr>
              {bodyCols.map((k) => (
                <HeadCell
                  key={k}
                  col={k}
                  def={columnDef(k, kind)}
                  label={columnLabel(k, kind)}
                  sort={sort}
                  onSort={() => setSort((cur) => nextSort(cur, k))}
                  dragging={dragCol}
                  dropTarget={dropCol === k && dragCol !== k}
                  fromLeft={dragCol !== null && order.indexOf(dragCol) < order.indexOf(k)}
                  onDragStart={() => setDragCol(k)}
                  onDragEnd={() => {
                    setDragCol(null);
                    setDropCol(null);
                  }}
                  onDragOver={() => setDropCol(k)}
                  onDragLeave={() => setDropCol((c) => (c === k ? null : c))}
                  onDrop={() => {
                    if (dragCol) saveOrder(moveColumn(order, dragCol, k));
                    setDragCol(null);
                    setDropCol(null);
                  }}
                  frozenLeft={frozenLeft[k]}
                  selected={k === "select" ? allVisibleSelected : undefined}
                  indeterminate={k === "select" ? someVisibleSelected : undefined}
                  onSelectAll={k === "select" ? toggleAllVisible : undefined}
                />
              ))}
              {orderedPeriodColumns.map((period) => (
                <PeriodHead
                  key={period.key}
                  period={period}
                  dragging={dragPeriod === period.key}
                  dropTarget={dropPeriod === period.key && dragPeriod !== period.key}
                  fromLeft={dragPeriod !== null && periodOrder.indexOf(dragPeriod) < periodOrder.indexOf(period.key)}
                  onDragStart={() => setDragPeriod(period.key)}
                  onDragEnd={() => { setDragPeriod(null); setDropPeriod(null); }}
                  onDragOver={() => setDropPeriod(period.key)}
                  onDragLeave={() => setDropPeriod((current) => current === period.key ? null : current)}
                  onDrop={() => {
                    if (dragPeriod) savePeriodOrder(movePeriodColumn(reconcilePeriodOrder(periodOrder, periodColumns), dragPeriod, period.key));
                    setDragPeriod(null);
                    setDropPeriod(null);
                  }}
                />
              ))}
              {hasDelete && (
                <HeadCell
                  col="delete" def={columnDef("delete", kind)} label={columnLabel("delete", kind)} sort={sort}
                  onSort={() => setSort((cur) => nextSort(cur, "delete"))} dragging={dragCol} dropTarget={false} fromLeft={false}
                  onDragStart={() => setDragCol("delete")} onDragEnd={() => { setDragCol(null); setDropCol(null); }} onDragOver={() => undefined}
                  onDragLeave={() => undefined} onDrop={() => undefined} frozenRight
                />
              )}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={tableColumnCount} className="px-5 py-14 text-[14px] font-semibold text-ink-muted">
                  <span className="sticky left-5">
                    {kind === "wcc"
                      ? "Nothing on the Weekly Compliance Checklist for these days."
                      : "Nothing on the Monthly Compliance Checklist for this period."}
                  </span>
                </td>
              </tr>
            )}
            {filtering && groups.length > 0 && !rows.some(matches) && (
              <tr>
                <td colSpan={tableColumnCount} className="px-5 py-10 text-[14px] font-semibold text-ink-muted">
                  <span className="sticky left-5">Nothing matches the search and status filters.</span>
                </td>
              </tr>
            )}
            {groups.map((g, gi) => {
              const groupRows = rowsOf(g.rowKeys);
              if (filtering && !groupRows.some(matches)) return null;
              // A search or filter opens every group that has a match.
              const isOpen = filtering || (multiPerson ? gi === 0 : true) !== toggled.has(g.key);
              const shown = (list: ComplianceRow[]) => (filtering ? list.filter(matches) : list);
              /* A sort orders the rows within a group — within each day of a team. */
              const rowsFor = (list: ComplianceRow[]) =>
                sortRows(list.filter(matches), sort).map((r) => (
                  <Row
                    key={r.key}
                    row={r}
                    cols={cols}
                    serial={serialOf.get(r.key) ?? 0}
                    today={today}
                    busy={busy}
                    onRun={run}
                    onEdit={() => setEditing(r)}
                    selected={selected.has(r.key)}
                    onToggleSelected={(next) => toggleSelected(r.key, next)}
                    frozenLeft={frozenLeft}
                    periodColumns={orderedPeriodColumns}
                    periodStatus={periodStatus}
                    onSavePeriodStatus={savePeriodStatus}
                  />
                ));
              const toggle = () =>
                setToggled((s) => {
                  const n = new Set(s);
                  if (n.has(g.key)) n.delete(g.key);
                  else n.add(g.key);
                  return n;
                });
              return (
                <React.Fragment key={g.key}>
                  {/* The group's name alone — the day (or the team), its date,
                      carried forward — and on WCC its Mins, under the Mins column:
                      of the rows shown, while a search or filter is on. */}
                  <HeadingRow
                    cols={cols}
                    kind={kind}
                    onClick={filtering ? undefined : toggle}
                    cellClassName={`select-none px-3 py-2 text-[12px] font-bold uppercase tracking-wider ${filtering ? "" : "cursor-pointer"}`}
                    cellStyle={GROUP_CELL}
                    label={
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-disabled={filtering || undefined}
                        title={filtering ? "Every group with a match stays open while a search or filter is on." : undefined}
                        className={`inline-flex items-center gap-2 whitespace-nowrap text-left font-bold uppercase tracking-wider ${filtering ? "cursor-default" : "cursor-pointer"}`}
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {g.label}
                      </button>
                    }
                    total={<MinsSum rows={shown(groupRows)} filtering={filtering} />}
                    columnCount={tableColumnCount}
                  />
                  {isOpen &&
                    (g.sections
                      ? g.sections.map((sec) => {
                          const sectionRows = rowsOf(sec.rowKeys);
                          if (filtering && !sectionRows.some(matches)) return null;
                          return (
                            <React.Fragment key={sec.key}>
                              <HeadingRow
                                cols={cols}
                                kind={kind}
                                cellClassName="px-3 py-1.5 text-[12.5px] font-bold text-ink-strong"
                                cellStyle={SECTION_CELL}
                                label={<span className="pl-5">{sec.label}</span>}
                                total={<MinsSum rows={shown(sectionRows)} filtering={filtering} />}
                                columnCount={tableColumnCount}
                              />
                              {rowsFor(sectionRows)}
                            </React.Fragment>
                          );
                        })
                      : rowsFor(groupRows))}
                </React.Fragment>
              );
            })}
          </tbody>
          {/* WCC's foot: the Total Compliance Mins of everything in view — or of
              the rows a search or filter leaves — under the Mins column, pinned
              to the bottom of the box. */}
          {kind === "wcc" && rows.length > 0 && (
            <tfoot>
              <TotalRow cols={cols} rows={filtering ? rows.filter(matches) : rows} filtering={filtering} columnCount={tableColumnCount} />
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

/**
 * One heading: a GRIP to drag the column anywhere, and the name, which sorts.
 *
 * Two separate handles, as on the Tasks table: making the whole heading
 * draggable competes with the sort click — a click that moves a few pixels
 * becomes a drag and the sort never fires.
 */
function HeadCell({
  col,
  def,
  label,
  sort,
  onSort,
  dragging,
  dropTarget,
  fromLeft,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  frozenLeft,
  frozenRight,
  selected,
  indeterminate,
  onSelectAll,
}: {
  col: ColKey;
  def: ColumnDef;
  label: string;
  sort: SortState<ColKey>;
  onSort: () => void;
  dragging: ColKey | null;
  dropTarget: boolean;
  fromLeft: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  frozenLeft?: number;
  frozenRight?: boolean;
  selected?: boolean;
  indeterminate?: boolean;
  onSelectAll?: (next: boolean) => void;
}) {
  const dir = sort?.key === col ? sort.dir : null;
  const movable = def.movable;
  const frozen = frozenLeft !== undefined || frozenRight;
  const isLeftEdge = col === "section";
  return (
    <th
      scope="col"
      aria-sort={def.sortable ? ariaSort(sort, col) : undefined}
      className={`${HEAD} ${frozen ? "z-40 bg-surface-card" : ""} ${frozenRight ? "right-0" : ""}`}
      onDragOver={
        movable
          ? (e) => {
              if (!dragging) return;
              e.preventDefault();
              onDragOver();
            }
          : undefined
      }
      onDragLeave={movable ? onDragLeave : undefined}
      onDrop={
        movable
          ? (e) => {
              e.preventDefault();
              onDrop();
            }
          : undefined
      }
      style={{
        left: frozenLeft,
        right: frozenRight ? 0 : undefined,
        // The ordinary sticky headers are z-20. This must be inline rather
        // than a second Tailwind z utility: `HEAD` already carries z-20 and
        // utility-rule ordering can otherwise let it win over z-40.
        zIndex: frozen ? 40 : 20,
        background: "var(--color-surface-card)",
        boxShadow: [
          "inset 0 -1px 0 var(--color-hairline-strong)",
          isLeftEdge ? "10px 0 14px -10px rgba(15,23,42,0.24)" : "",
          frozenRight ? "-10px 0 14px -10px rgba(15,23,42,0.24)" : "",
          // Where the column will land — the edge it would arrive on.
          dropTarget ? `inset ${fromLeft ? "-3px" : "3px"} 0 0 var(--color-altus-red)` : "",
        ]
          .filter(Boolean)
          .join(", "),
        opacity: dragging === col ? 0.45 : 1,
      }}
    >
      <span className={`flex items-center gap-1 ${def.align === "right" ? "justify-end" : ""}`}>
        {onSelectAll ? (
          <Checkbox
            checked={Boolean(selected)}
            indeterminate={Boolean(indeterminate)}
            onChange={onSelectAll}
            ariaLabel="Select all visible compliances"
            className="mx-auto"
          />
        ) : movable && (
          <span
            draggable
            onDragStart={(e) => {
              onDragStart();
              e.dataTransfer.effectAllowed = "move";
              // Firefox refuses to start a drag without a payload.
              e.dataTransfer.setData("text/plain", col);
            }}
            onDragEnd={onDragEnd}
            role="button"
            tabIndex={-1}
            aria-label={`Move the ${label} column`}
            title="Drag to move this column"
            className="inline-flex cursor-grab text-ink-subtle opacity-40 transition-opacity hover:text-ink-strong active:cursor-grabbing group-hover/head:opacity-100"
          >
            <GripVertical size={13} strokeWidth={2.4} aria-hidden />
          </span>
        )}
        {def.sortable ? (
          <button
            type="button"
            onClick={onSort}
            title={[
              def.hint,
              dir === "asc"
                ? `Sorted by ${label}, ascending — click for descending`
                : dir === "desc"
                  ? `Sorted by ${label}, descending — click to clear`
                  : `Sort by ${label}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            className={`group/sort inline-flex items-center gap-1.5 select-none transition-colors hover:text-ink-strong ${dir ? "text-ink-strong" : ""}`}
          >
            {label}
            {dir === "asc" ? (
              <ArrowUp size={13} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />
            ) : dir === "desc" ? (
              <ArrowDown size={13} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />
            ) : (
              <ChevronsUpDown size={13} strokeWidth={2.4} className="text-ink-subtle opacity-45 transition-opacity group-hover/sort:opacity-100" />
            )}
          </button>
        ) : (
          label
        )}
      </span>
    </th>
  );
}

type StatusFilter = DoerStatus | "carried" | "lapsed";

/** A `?status=` value, or null if it names no chip this board has. */
function asStatusFilter(v: string): StatusFilter | null {
  if (v === "carried" || v === "lapsed") return v;
  return isDoerStatus(v) ? v : null;
}

/** The chips a row answers to: its Doer Status, and whether it is carried forward or lapsed. */
function filterKeysOf(r: ComplianceRow): StatusFilter[] {
  // A blank stored value is an untouched row, not another user-facing status.
  // It remains null for reminders, while the board presents the first real
  // workflow state: Not Read.
  const keys: StatusFilter[] = [r.doerStatus ?? "dont_know"];
  if (r.carried) keys.push("carried");
  if (r.lapsed) keys.push("lapsed");
  return keys;
}

/**
 * THE DOER STATUS CHIPS ARE FILTERS. Click one to show only those rows; click
 * more to add them; click again to drop one. "Not filled" is the first — the
 * rows nobody has touched, which is what a Team Lead looks for. Each chip
 * carries its count so an empty filter is visible before it is clicked.
 * "Carried forward" and "Lapsed" close the row: not Done by their day and
 * still open, and not Done before they closed.
 */
function StatusFilters({
  active,
  counts,
  onToggle,
}: {
  active: ReadonlySet<StatusFilter>;
  counts: ReadonlyMap<StatusFilter, number>;
  onToggle: (s: StatusFilter) => void;
}) {
  const chips: { key: StatusFilter; label: string; bg: string; ink: string; border: string; dot: string }[] = [
    ...DOER_STATUSES.map((s) => {
      const t = doerStyle(s);
      return { key: s as StatusFilter, label: doerLabel(s), bg: t.bg, ink: t.ink, border: t.border, dot: t.dot };
    }),
    { key: "carried", label: "Carried forward", bg: "#FFFBEB", ink: "#B45309", border: "#FCD34D", dot: "#F59E0B" },
    { key: "lapsed", label: "Lapsed", bg: "#F1F5F9", ink: "#475569", border: "#CBD5E1", dot: "#64748B" },
  ];
  return (
    <div className="flex w-max items-center gap-1" role="group" aria-label="Filter by Doer Status">
      {chips.map((c) => {
        const on = active.has(c.key);
        const n = counts.get(c.key) ?? 0;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c.key)}
            title={on ? `Showing ${c.label} — click to stop filtering by it` : `Show only ${c.label}`}
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[11.5px] font-bold transition-[filter,opacity,box-shadow,border-color] hover:brightness-95 min-[1680px]:px-2 ${
              active.size > 0 && !on ? "opacity-45" : ""
            }`}
            style={{
              background: c.bg,
              color: c.ink,
              borderColor: on ? c.ink : c.border,
              borderStyle: "solid",
              boxShadow: on ? `0 0 0 2px color-mix(in srgb, ${c.dot} 35%, transparent)` : undefined,
            }}
          >
            <span className="inline-block size-[6px] rounded-full" style={{ background: c.dot }} />
            {c.label}
            <span className="tabular-nums opacity-70">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The chips' own line: it scrolls sideways when the screen is too narrow for
 * every chip, fading at the edge that has more, so nothing wraps. The chips
 * sit in a box as wide as they are, so a chip that grows — a count, a wider
 * screen — is measured again. The mouse wheel scrolls it sideways, and a chip
 * reached with Tab is brought clear of the fade.
 */
function ChipStrip({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [more, setMore] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);
  React.useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    // A plain wheel moves the chips sideways — only while they can still move
    // that way, so the page scrolls as usual once they are at their end.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      const to = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY));
      if (to === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = to;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure]);
  const fade = `${more.left ? "transparent, #000 24px" : "#000"}, ${more.right ? "#000 calc(100% - 24px), transparent" : "#000"}`;
  return (
    <div
      ref={ref}
      onScroll={measure}
      onFocus={(e) => e.target.scrollIntoView({ block: "nearest", inline: "nearest" })}
      className="min-w-0 flex-1 scroll-px-7 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: `linear-gradient(to right, ${fade})`, WebkitMaskImage: `linear-gradient(to right, ${fade})` }}
    >
      {children}
    </div>
  );
}

const GROUP_CELL: React.CSSProperties = {
  background: "color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card))",
  color: "var(--color-altus-red-deep)",
};
const SECTION_CELL: React.CSSProperties = {
  background: "var(--color-surface-soft)",
  boxShadow: "inset 0 -1px 0 var(--color-hairline)",
};
const TOTAL_CELL: React.CSSProperties = {
  background: "color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card))",
  boxShadow: "inset 0 1px 0 var(--color-hairline-strong)",
};

/**
 * A heading across the table — a group, a team's day. It carries only its
 * name (account holder, 2026-09-19: "just the day or Daily, the date, carried
 * forward — the rest crowds it"), and on WCC the Mins added up, placed over
 * the Mins column like a subtotal. One cell spans the whole row, so the name
 * stays pinned in view however far the table scrolls sideways; MCC has no
 * Mins column, so its headings are the name alone.
 */
function HeadingRow({
  cols,
  kind,
  label,
  total,
  onClick,
  cellClassName,
  cellStyle,
  columnCount,
}: {
  cols: ColKey[];
  kind: ComplianceKind;
  label: React.ReactNode;
  total: React.ReactNode;
  onClick?: () => void;
  cellClassName: string;
  cellStyle: React.CSSProperties;
  columnCount: number;
}) {
  const spot = minsSpot(cols, kind);
  return (
    <tr onClick={onClick}>
      <td colSpan={columnCount} className={`relative ${cellClassName}`} style={cellStyle}>
        <PinnedName spot={spot} room={340} background={cellStyle.background}>
          {label}
        </PinnedName>
        {spot && <OverMins spot={spot}>{total}</OverMins>}
      </td>
    </tr>
  );
}

/** Where the Mins column sits — from the table's left edge — or null without one. */
function minsSpot(cols: ColKey[], kind: ComplianceKind): { left: number; width: number } | null {
  const at = kind === "wcc" ? cols.indexOf("mins") : -1;
  if (at < 0) return null;
  return { left: cols.slice(0, at).reduce((n, k) => n + columnDef(k, kind).width, 0), width: columnDef("mins", kind).width };
}

/**
 * A heading's name, pinned to the left of the box as the table scrolls
 * sideways, over a background of its own so a total passing under it is
 * covered, not mixed in. When Mins has been dragged too far left to leave it
 * `room`, the name starts after the Mins column instead.
 */
function PinnedName({
  spot,
  room,
  background,
  className = "",
  children,
}: {
  spot: { left: number; width: number } | null;
  room: number;
  background: React.CSSProperties["background"];
  className?: string;
  children: React.ReactNode;
}) {
  const after = spot !== null && spot.left < room;
  return (
    <span
      className={`sticky left-3 z-[1] inline-flex items-center whitespace-nowrap pr-3 ${className}`}
      style={{ background, marginLeft: after ? spot.left + spot.width : undefined }}
    >
      {children}
    </span>
  );
}

/** A heading's figure, laid exactly over the Mins column (the widths are fixed). */
function OverMins({ spot, children }: { spot: { left: number; width: number }; children: React.ReactNode }) {
  return (
    <span
      className="absolute inset-y-0 flex items-center justify-end px-3 normal-case tracking-normal"
      style={{ left: spot.left, width: spot.width }}
    >
      {children}
    </span>
  );
}

/**
 * The Mins of a group added up, in the Mins column — the figure lines up with
 * the rows' own. "—" when none has Mins yet; the hover says how many are left
 * out of a total that is still partial.
 */
function MinsSum({ rows, filtering = false }: { rows: readonly ComplianceRow[]; filtering?: boolean }) {
  const t = totalMinutes(rows);
  const of = filtering ? " of the rows shown" : "";
  const title =
    t.timed === 0
      ? "No Mins set yet — set them in the Mins column."
      : t.untimed > 0
        ? `${minutesText(t.total)}${of} — ${t.untimed} of ${rows.length} have no Mins yet, so the total leaves them out.`
        : `${minutesText(t.total)}${of} in all.`;
  return (
    <span title={title} className="inline-flex items-center gap-1 pr-2 text-[12.5px] font-bold tabular-nums">
      <Clock size={11} strokeWidth={2.4} aria-hidden className="opacity-70" />
      {t.timed ? t.total : "—"}
    </span>
  );
}

/** The foot of the WCC table: the Total Compliance Mins of the rows in view. */
function TotalRow({ cols, rows, filtering, columnCount }: { cols: ColKey[]; rows: readonly ComplianceRow[]; filtering: boolean; columnCount: number }) {
  const t = totalMinutes(rows);
  const note = [t.timed && t.total >= 60 ? hoursText(t.total) : "", t.untimed > 0 ? `${t.untimed} without Mins` : ""].filter(Boolean).join(" · ");
  const spot = minsSpot(cols, "wcc");
  return (
    <tr>
      <td colSpan={columnCount} className="sticky bottom-0 z-10 px-3 py-2.5 text-[13.5px] font-bold text-ink-strong" style={TOTAL_CELL}>
        <PinnedName spot={spot} room={480} background={TOTAL_CELL.background} className="gap-2">
          <Clock size={14} strokeWidth={2.4} aria-hidden style={{ color: "var(--color-altus-red-deep)" }} />
          {filtering ? "Total Compliance Mins — rows shown" : "Total Compliance Mins"}
          {note && <span className="text-[12px] font-semibold text-ink-subtle">({note})</span>}
        </PinnedName>
        {spot && (
          <OverMins spot={spot}>
            <span className="pr-2 tabular-nums" style={{ color: "var(--color-altus-red-deep)" }} title={t.timed ? minutesText(t.total) : "No Mins set yet"}>
              {t.timed ? t.total : "—"}
            </span>
          </OverMins>
        )}
      </td>
    </tr>
  );
}

/* ── One row ───────────────────────────────────────────────────────────── */

function formatActual(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date: formatDeadline(day), time };
}

/** One row, its cells in the order of the person's columns. */
function Row({
  row: r,
  cols,
  serial,
  today,
  busy,
  onRun,
  onEdit,
  selected,
  onToggleSelected,
  frozenLeft,
  periodColumns,
  periodStatus,
  onSavePeriodStatus,
}: {
  row: ComplianceRow;
  cols: ColKey[];
  serial: number;
  today: string;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
  onEdit: () => void;
  selected: boolean;
  onToggleSelected: (next: boolean) => void;
  frozenLeft: Partial<Record<ColKey, number>>;
  periodColumns: readonly CompliancePeriodColumn[];
  periodStatus: ReadonlyMap<string, string>;
  onSavePeriodStatus: (itemId: string, period: CompliancePeriodColumn, status: string) => Promise<void>;
}) {
  const router = useRouter();
  const saving = busy === r.key;
  const actual = formatActual(r.doneAt);
  const overdueUnfilled = r.doerStatus === null && r.deadline < today;
  const ruledOut = r.approver === "cancelled" || r.approver === "archived";
  /* The count pop-up: on the way into Done, or correcting a Done row's count. */
  const [asking, setAsking] = React.useState<"done" | "edit" | null>(null);
  const canCount = r.quantity !== null && r.doerStatus === "done" && r.canFill && busy === null;
  const pinnedClass = (key: ColKey) => {
    if (frozenLeft[key] !== undefined) {
      return `sticky z-10 bg-surface-card group-hover/row:bg-surface-soft ${key === "section" ? "shadow-[10px_0_14px_-10px_rgba(15,23,42,0.18)]" : ""}`;
    }
    return key === "delete"
      ? "sticky right-0 z-10 bg-surface-card shadow-[-10px_0_14px_-10px_rgba(15,23,42,0.18)] group-hover/row:bg-surface-soft"
      : "";
  };
  const pinnedStyle = (key: ColKey): React.CSSProperties => ({
    left: frozenLeft[key],
    right: key === "delete" ? 0 : undefined,
    // Keep both frozen rails above scrolling cells. Header cells use 40; body
    // cells use 30, so the Delete column stays visible at the right edge.
    zIndex: frozenLeft[key] !== undefined || key === "delete" ? 30 : undefined,
  });

  const cell = (k: ColKey): React.ReactNode => {
    switch (k) {
      case "select":
        return (
          <td key={k} className={`px-3 py-2.5 text-center ${pinnedClass(k)}`} style={pinnedStyle(k)}>
            <Checkbox checked={selected} onChange={onToggleSelected} ariaLabel={`Select ${r.title}`} />
          </td>
        );
      case "sr":
        return <td key={k} className={`px-3 py-2.5 text-[13px] font-semibold tabular-nums text-ink-subtle ${pinnedClass(k)}`} style={pinnedStyle(k)}>{serial}</td>;
      case "employee":
        return <td key={k} className="px-3 py-2.5 text-[13.5px] font-semibold text-ink-strong">{r.ownerName}</td>;
      case "compliance":
        return (
          <td key={k} className={`px-3 py-2.5 ${pinnedClass(k)}`} style={pinnedStyle(k)}>
            <div className="text-[14px] font-semibold text-ink-strong">{r.title}</div>
            <div className={r.fromMaster ? "mt-0.5 flex flex-wrap items-center gap-1" : "hidden"}>
              {r.fromMaster && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-ink-subtle" style={{ background: "var(--color-surface-track, #eef2f7)" }} title="Given by the position's DCC Master — change it there.">
                  <Lock size={9} /> {r.fromMaster} master
                </span>
              )}
            </div>
          </td>
        );
      case "section":
        return (
          <td key={k} className={`px-3 py-2.5 ${pinnedClass(k)}`} style={pinnedStyle(k)}>
            {r.section ? (
              <span className="inline-flex max-w-full truncate rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-bold text-ink-soft" title={r.section}>
                {r.section}
              </span>
            ) : (
              <span className="text-[13px] text-ink-subtle">—</span>
            )}
          </td>
        );
      case "frequency":
        // MCC: the day of the month it is due, alone; the words are on hover.
        return r.kind === "mcc" ? (
          <td key={k} className="px-3 py-2.5">
            <span
              className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12px] font-bold tabular-nums whitespace-nowrap"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}
              title={[r.schedule, r.scheduleDetail].filter(Boolean).join(" — ")}
            >
              {deadlineDayText(r.deadline)}
            </span>
          </td>
        ) : (
          <td key={k} className="px-3 py-2.5 text-[13px] text-ink-soft">
            {r.schedule}
          </td>
        );
      case "deadline":
        return (
          <td key={k} className="px-3 py-2.5 text-[13.5px] font-bold tabular-nums whitespace-nowrap" style={{ color: overdueUnfilled ? "#B91C1C" : "var(--color-ink-strong)" }}>
            {formatDeadline(r.deadline)}
          </td>
        );
      case "mins":
        return (
          <td key={k} className="px-3 py-2 text-right">
            <MinsCell
              value={r.minutes}
              editable={r.canSetMinutes && busy === null}
              onCommit={(m) => onRun(r.key, () => setComplianceMinutes({ itemId: r.itemId, minutes: m }))}
            />
          </td>
        );
      case "doerStatus":
        return (
          <td key={k} className="px-3 py-2">
            <DoerCell
              status={r.doerStatus}
              disabled={!r.canFill || busy !== null}
              title={
                r.canFill
                  ? undefined
                  : r.lapsed
                    ? `Lapsed on ${shortDay(addDays(r.openUntil, 1))} — not Done while it was open; it stays as it is.`
                    : r.locked
                      ? "Closed — its time has passed; what was filled stays as it is."
                      : r.notYetOpen
                        ? `Not open yet — it can be filled from ${shortDay(r.opensOn)}.`
                        : undefined
              }
              onSet={(s) => {
                // A compliance that counts is not Done until it says how many.
                if (s === "done" && r.quantity && r.doerStatus !== "done") setAsking("done");
                else void onRun(r.key, () => setComplianceDoer({ itemId: r.itemId, deadline: r.deadline, doerStatus: s }));
              }}
            />
            <RowState row={r} />
            {r.quantity && (
              <QuantityPrompt
                open={asking !== null}
                onOpenChange={(o) => !o && setAsking(null)}
                marking={asking === "done"}
                title={r.title}
                quantity={r.quantity}
                initial={asking === "edit" ? r.completedQuantity : null}
                onSubmit={(n) =>
                  onRun(r.key, () =>
                    setComplianceDoer({
                      itemId: r.itemId,
                      deadline: r.deadline,
                      ...(asking === "done" ? { doerStatus: "done" as const } : {}),
                      completedQuantity: n,
                    }),
                  )
                }
              />
            )}
          </td>
        );
      case "qty":
        return (
          <td key={k} className="px-3 py-2.5 whitespace-nowrap">
            <QuantityCell row={r} editable={canCount} onEdit={() => setAsking("edit")} />
          </td>
        );
      case "actual":
        return (
          <td key={k} className="px-3 py-2.5 text-[13px] tabular-nums whitespace-nowrap text-ink-soft">
            {saving ? (
              <Loader2 size={14} className="animate-spin text-ink-subtle" />
            ) : actual ? (
              <>
                <div className="font-semibold text-ink-strong">{actual.date}</div>
                <div className="text-[11px] text-ink-subtle">{actual.time}</div>
              </>
            ) : (
              <span className="text-ink-subtle">—</span>
            )}
          </td>
        );
      case "var":
        return (
          <td key={k} className="px-3 py-2.5 text-right">
            <VarianceChip days={r.variance} running={r.running} lapsed={r.lapsed} />
          </td>
        );
      case "approver":
        return (
          <td key={k} className="px-3 py-2">
            <ApproverChip
              shown={r.approver}
              labels={COMPLIANCE_APPROVER_LABEL}
              choices={busy !== null ? [] : r.approverChoices}
              lockedTitle={r.canFill && !r.canApproverNotes ? "You can't rule on your own compliance — your Team Lead does." : "Only the doer's manager, whoever gave it, or an admin can change this."}
              onPick={async (choice) => {
                const res = await setComplianceApprover({ itemId: r.itemId, deadline: r.deadline, status: choice });
                if (res.ok) router.refresh();
                return res.ok ? null : res.error;
              }}
            />
          </td>
        );
      case "doerNotes":
        return (
          <td key={k} className="px-3 py-2">
            <ConfirmedNoteCell
              value={r.doerNotes}
              editable={r.canFill && busy === null}
              onCommit={(v) => onRun(r.key, () => setComplianceDoer({ itemId: r.itemId, deadline: r.deadline, notes: v }))}
            />
          </td>
        );
      case "approverNotes":
        return (
          <td key={k} className="px-3 py-2">
            <ConfirmedNoteCell
              value={r.approverNotes}
              editable={r.canApproverNotes && busy === null}
              onCommit={(v) => onRun(r.key, () => setComplianceApprover({ itemId: r.itemId, deadline: r.deadline, notes: v }))}
            />
          </td>
        );
      case "edit":
        return (
          <td key={k} className="px-2 py-2 text-right whitespace-nowrap">
            {r.canManage && (
              <button type="button" onClick={onEdit} aria-label="Edit compliance" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong">
                <Pencil size={14} />
              </button>
            )}
          </td>
        );
      case "delete":
        return (
          <td key={k} className={`px-2 py-2 text-center whitespace-nowrap ${pinnedClass(k)}`} style={pinnedStyle(k)}>
            <button
              type="button"
              aria-label="Remove compliance"
              title={r.canManage ? "Remove compliance" : r.fromMaster ? "This is managed by DCC Masters." : "You cannot remove this compliance."}
              disabled={busy !== null || !r.canManage}
              onClick={() => {
                if (!window.confirm(`Remove "${r.title}" from ${r.ownerName}'s checklist? What was filled stays on record.`)) return;
                void onRun(r.key, () => archiveComplianceItem(r.itemId));
              }}
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </td>
        );
    }
  };

  const periodCell = (period: CompliancePeriodColumn) => {
    const status = periodStatus.get(compliancePeriodKey(r.itemId, period)) ?? "";
    const editable = (r.canFill || r.canManage) && busy === null;
    const tone = compliancePeriodTone(status);
    return (
      <td key={period.key} className="px-2 py-2 text-center" style={{ background: period.current ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" : undefined }}>
        <select
          value={status}
          disabled={!editable}
          aria-label={`${period.label} status for ${r.title}`}
          title={editable ? `${period.detail}: choose the period status` : "You can update period checks for your own compliances and your team's only."}
          onChange={(event) => void onSavePeriodStatus(r.itemId, period, event.target.value)}
          className="w-full cursor-pointer appearance-none rounded-lg px-1.5 py-1.5 text-center text-[12px] font-bold outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: tone.bg, color: tone.fg, border: period.current ? "1.5px solid var(--color-altus-red)" : `1px solid ${status ? "transparent" : "var(--color-hairline)"}` }}
        >
          <option value="">-</option>
          {COMPLIANCE_PERIOD_STATUSES.map((option) => <option key={option} value={option}>{option === "Not Applicable" ? "N/A" : option}</option>)}
        </select>
      </td>
    );
  };

  return (
    <tr
      className={`group/row align-top transition-colors hover:bg-surface-soft ${ruledOut ? "opacity-60" : ""}`}
      style={{ borderBottom: "1px solid var(--color-hairline)" }}
    >
      {cols.filter((col) => col !== "delete").map(cell)}
      {periodColumns.map(periodCell)}
      {cols.includes("delete") && cell("delete")}
    </tr>
  );
}

/**
 * MINS — how many minutes the compliance takes, each time it is due. Whoever
 * manages the person's compliances clicks it to set or change it: "15",
 * "1h 30m", "1:30". It is the compliance's own, so every day it is due
 * changes with it; blank clears it.
 */
function MinsCell({
  value,
  editable,
  onCommit,
}: {
  value: number | null;
  editable: boolean;
  onCommit: (minutes: number | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const cancelled = React.useRef(false);

  if (!editable || !editing) {
    const shown =
      value === null ? (
        editable ? (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-subtle">
            <Plus size={12} aria-hidden /> Add
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        )
      ) : (
        <span className="text-[13.5px] font-bold tabular-nums text-ink-strong">{value}</span>
      );
    // The same box as the button below, so a value does not shift while
    // another row saves, and stays in line with the totals.
    if (!editable)
      return (
        <span
          title={value === null ? "No Mins set" : `${minutesText(value)} each time it is due`}
          className="inline-flex min-w-[52px] items-center justify-end border border-transparent px-2 py-1"
        >
          {shown}
        </span>
      );
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value === null ? "" : String(value));
          setEditing(true);
        }}
        title={value === null ? "Set how many minutes it takes" : `${minutesText(value)} each time it is due — click to change`}
        aria-label={value === null ? "Set the Mins" : `Mins ${value} — change`}
        className="inline-flex min-w-[52px] items-center justify-end rounded-lg border border-transparent px-2 py-1 transition-colors hover:border-hairline-strong hover:bg-white"
      >
        {shown}
      </button>
    );
  }

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      setEditing(false);
      return;
    }
    const c = parseMinutes(draft);
    if (!c.ok) {
      fireToast({ message: c.error, type: "error" });
      setEditing(false);
      return;
    }
    if (c.value !== value) await onCommit(c.value);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      inputMode="numeric"
      autoComplete="off"
      maxLength={12}
      placeholder="e.g. 15"
      aria-label="Mins"
      className="nt-input w-[84px] py-1 text-right text-[13.5px] font-bold tabular-nums"
    />
  );
}

function DoerCell({
  status,
  disabled,
  title,
  onSet,
}: {
  status: DoerStatus | null;
  disabled: boolean;
  /** Why it cannot be changed, on hover. */
  title?: string;
  onSet: (s: DoerStatus) => void;
}) {
  // Untouched rows remain null in storage for reminder logic, but the checklist
  // starts them at the first selectable workflow state rather than showing a
  // separate “Not filled” option.
  const shown = status ?? "dont_know";
  const tone = doerStyle(shown);
  return (
    <select
      value={shown}
      disabled={disabled}
      title={title}
      aria-label="Doer Status"
      onChange={(e) => e.target.value && onSet(e.target.value as DoerStatus)}
      className="min-w-[130px] cursor-pointer rounded-full border px-2.5 py-1 text-[12.5px] font-bold outline-none disabled:cursor-default"
      style={{ background: tone.bg, color: tone.ink, borderColor: tone.border }}
    >
      {DOER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {doerLabel(s)}
        </option>
      ))}
    </select>
  );
}

/**
 * Under the Doer Status: CARRIED FORWARD (not Done by its day, still open —
 * and until when), LAPSED (closed without being Done), or when it OPENS.
 */
function RowState({ row: r }: { row: ComplianceRow }) {
  if (r.lapsed) {
    return (
      <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500" title="Not Done while it was open — what was filled stays as it is.">
        <Lock size={10} aria-hidden /> Lapsed {shortDay(addDays(r.openUntil, 1))}
      </span>
    );
  }
  if (r.carried) {
    return (
      <span className="mt-1 block whitespace-nowrap text-[11px] font-bold" style={{ color: "#B45309" }} title="Not Done by its day — still open until it lapses.">
        Carried forward · open till {shortDay(r.openUntil)}
      </span>
    );
  }
  if (r.notYetOpen) return <span className="mt-1 block text-[11px] font-semibold text-ink-subtle">Opens {shortDay(r.opensOn)}</span>;
  return null;
}

function VarianceChip({ days, running, lapsed }: { days: number | null; running: boolean; lapsed: boolean }) {
  if (lapsed) {
    return (
      <span
        className="inline-block rounded px-1.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap"
        style={{ background: "rgba(100,116,139,0.12)", color: "#475569" }}
        title="Not Done while it was open"
      >
        Lapsed
      </span>
    );
  }
  if (days === null) return <span className="text-ink-subtle">—</span>;
  const style =
    days > 0
      ? { background: "rgba(185,28,28,0.10)", color: "#b91c1c" }
      : days < 0
        ? { background: "rgba(22,128,61,0.10)", color: "#15803d" }
        : { background: "rgba(100,116,139,0.10)", color: "#475569" };
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 font-mono text-[12px] font-bold tabular-nums whitespace-nowrap"
      style={style}
      title={running ? "Not done yet — days late so far" : days > 0 ? "Done late" : days < 0 ? "Done early" : "Done on the deadline"}
    >
      {days > 0 ? `+${days}` : days}
      {running ? "…" : ""}
    </span>
  );
}

/**
 * QUANTITY DONE — "18 / 25 emails": green at or over the target, amber short of
 * it. An open row shows the target alone; a compliance that does not count, a
 * dash. The doer clicks a Done row's count to correct it.
 */
function QuantityCell({ row: r, editable, onEdit }: { row: ComplianceRow; editable: boolean; onEdit: () => void }) {
  const q = r.quantity;
  const emptyBox = (title: string) => (
    <input
      readOnly
      value=""
      placeholder="—"
      aria-label="Quantity done"
      title={title}
      className="h-8 w-10 rounded-md border border-hairline-strong bg-white text-center text-[13px] font-semibold text-ink-subtle outline-none placeholder:text-ink-subtle"
    />
  );
  if (!q) return emptyBox("This compliance has no quantity target.");
  if (!q) return <span className="text-ink-subtle">—</span>;
  const from = q.source === "title" ? "Target read from the compliance's title" : "The compliance's Target";
  if (r.doerStatus !== "done") {
    return (
      <div className="flex items-center gap-1.5">
        {emptyBox(`${from}. Entered when this compliance is marked Done.`)}
        <span className="text-[12.5px] tabular-nums text-ink-subtle" title={`${from}. Asked for when it is marked Done.`}>
          / {q.target}{q.unit ? ` ${q.unit}` : ""}
        </span>
      </div>
    );
  }
  const n = r.completedQuantity;
  const style =
    n === null
      ? { background: "rgba(100,116,139,0.10)", color: "#475569" }
      : n >= q.target
        ? { background: "rgba(22,128,61,0.10)", color: "#15803d" }
        : { background: "rgba(217,119,6,0.12)", color: "#b45309" };
  const said =
    n === null
      ? "Done, but how many was not recorded"
      : `${n} of ${q.target} completed (${Math.round((n / q.target) * 100)}%)`;
  const chip = (
    <span className="inline-block rounded px-1.5 py-0.5 text-[12.5px] font-bold tabular-nums" style={style}>
      {quantityText(n, q)}
    </span>
  );
  if (!editable) return <span title={`${said}. ${from}.`}>{chip}</span>;
  return (
    <button
      type="button"
      onClick={onEdit}
      title={`${said} — click to ${n === null ? "add" : "change"} it.`}
      aria-label={`${said}. Change the count`}
      className="rounded transition-[filter] hover:brightness-95"
    >
      {chip}
    </button>
  );
}

/**
 * HOW MANY WERE COMPLETED? — asked on the way into Done for a compliance that
 * counts, and when its count is corrected. A whole number, 0 or more; more than
 * the target is allowed (the work was done). Cancelling leaves the row as it was.
 */
function QuantityPrompt({
  open,
  onOpenChange,
  marking,
  title,
  quantity,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True on the way into Done; false when correcting a Done row's count. */
  marking: boolean;
  title: string;
  quantity: QuantityTarget;
  initial: number | null;
  onSubmit: (n: number) => Promise<boolean>;
}) {
  const inputId = React.useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60]" style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-section bg-surface-card shadow-xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => (document.getElementById(inputId) as HTMLInputElement | null)?.select());
          }}
        >
          {open && (
            <QuantityForm
              inputId={inputId}
              marking={marking}
              title={title}
              quantity={quantity}
              initial={initial}
              onSubmit={onSubmit}
              onDone={() => onOpenChange(false)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function QuantityForm({
  inputId,
  marking,
  title,
  quantity,
  initial,
  onSubmit,
  onDone,
}: {
  inputId: string;
  marking: boolean;
  title: string;
  quantity: QuantityTarget;
  initial: number | null;
  onSubmit: (n: number) => Promise<boolean>;
  onDone: () => void;
}) {
  const [draft, setDraft] = React.useState(initial === null ? "" : String(initial));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const unit = quantity.unit ? ` ${quantity.unit}` : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = checkQuantity(draft);
    if (!c.ok) {
      setError(c.error);
      return;
    }
    setSaving(true);
    const ok = await onSubmit(c.value);
    setSaving(false);
    if (ok) onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <div className="relative px-6 pb-4 pt-5" style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}>
        <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
        <Dialog.Title className="pr-10 text-[20px] font-black tracking-[-0.02em] text-ink-strong">
          {marking ? "How many were completed?" : "Change the count"}
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-[13.5px] font-semibold text-ink-muted">{title}</Dialog.Description>
        <Dialog.Close asChild>
          <button type="button" aria-label="Close" className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted hover:bg-surface-soft">
            <X size={16} strokeWidth={2.4} />
          </button>
        </Dialog.Close>
      </div>

      <div className="flex flex-col gap-2 px-6 py-5">
        <label htmlFor={inputId} className="text-[14px] font-bold text-ink-strong">
          Completed<span style={{ color: "rgb(168, 4, 0)" }}> *</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={String(MAX_QUANTITY).length}
            aria-invalid={error !== null}
            aria-describedby={`${inputId}-hint`}
            className="nt-input text-[16px] font-bold tabular-nums"
            style={{ width: 120 }}
          />
          <span className="text-[14px] font-semibold text-ink-soft">
            of {quantity.target}
            {unit}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(String(quantity.target));
              setError(null);
            }}
            className="ml-auto rounded-lg border border-hairline-strong bg-white px-2.5 py-1 text-[12.5px] font-bold text-ink-soft hover:text-ink-strong"
          >
            All {quantity.target}
          </button>
        </div>
        <span id={`${inputId}-hint`} className="text-[12px] font-medium" style={{ color: error ? "#B91C1C" : "var(--color-ink-subtle)" }} role={error ? "alert" : undefined}>
          {error ?? "A whole number, 0 or more — the exact count, even when short of the target."}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-6 py-3.5">
        <Dialog.Close asChild>
          <button type="button" className="h-10 rounded-lg border border-hairline-strong bg-white px-4 text-[14px] font-bold text-ink-muted hover:bg-surface-soft">
            Cancel
          </button>
        </Dialog.Close>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {marking ? "Mark Done" : "Save count"}
        </button>
      </div>
    </form>
  );
}

function NoteCell({ value, editable, onCommit }: { value: string | null; editable: boolean; onCommit: (v: string | null) => void }) {
  const current = value ?? "";
  const [draft, setDraft] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    setDraft(current);
  }
  const ref = React.useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, draft);

  if (!editable) {
    return <span className={`block max-w-[240px] whitespace-pre-wrap text-[13px] ${value ? "text-ink-soft" : "text-ink-subtle"}`}>{value || "—"}</span>;
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      style={{ overflow: "hidden" }}
      value={draft}
      maxLength={2000}
      placeholder="Add a note"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t !== current.trim()) onCommit(t || null);
        else setDraft(current);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(current);
          e.currentTarget.blur();
        }
      }}
      className="w-full min-w-[200px] resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink-strong outline-none placeholder:text-ink-subtle hover:border-hairline-strong focus:border-hairline-strong focus:bg-white"
    />
  );
}

/* ── Adding or changing a compliance — a pop-up, like New Task ─────────── */

function ConfirmedNoteCell({
  value,
  editable,
  onCommit,
}: {
  value: string | null;
  editable: boolean;
  onCommit: (v: string | null) => Promise<boolean>;
}) {
  const current = value ?? "";
  const [draft, setDraft] = React.useState(current);
  const [editing, setEditing] = React.useState(!current);
  const [saving, setSaving] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, draft);

  React.useEffect(() => {
    setDraft(current);
    setEditing(!current);
  }, [current]);

  if (!editable) {
    return <span className={`block max-w-[240px] whitespace-pre-wrap text-[13px] ${value ? "text-ink-soft" : "text-ink-subtle"}`}>{value || "—"}</span>;
  }

  const save = async () => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    try {
      if (await onCommit(next)) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex min-w-[200px] items-start gap-1">
        <span className="min-w-0 flex-1 whitespace-pre-wrap px-2 py-1 text-[13px] text-ink-strong">{current}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit note"
          title="Edit note"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-[200px] items-end gap-1">
      <textarea
        ref={ref}
        autoFocus={Boolean(current)}
        rows={1}
        style={{ overflow: "hidden" }}
        value={draft}
        maxLength={2000}
        placeholder="Add a note"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(current);
            setEditing(!current);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        className="min-h-8 min-w-0 flex-1 resize-none rounded-lg border border-hairline-strong bg-white px-2 py-1 text-[13px] text-ink-strong outline-none placeholder:text-ink-subtle focus-visible:ring-2 focus-visible:ring-altus-red/30"
      />
      {draft.trim() && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          aria-label="Done editing note"
          title="Done"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
        </button>
      )}
      {current && (
        <button
          type="button"
          onClick={() => {
            setDraft(current);
            setEditing(false);
          }}
          aria-label="Cancel editing note"
          title="Cancel"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Accounts-style period heading with the same drag-and-drop behavior in WCC
 * and MCC.  Period columns move only within their timeline, never into the
 * normal checklist/action columns. */
function PeriodHead({
  period,
  dragging,
  dropTarget,
  fromLeft,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  period: CompliancePeriodColumn;
  dragging: boolean;
  dropTarget: boolean;
  fromLeft: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <th
      scope="col"
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`${HEAD} text-center transition-opacity ${dragging ? "opacity-45" : ""}`}
      style={{
        background: period.current ? "color-mix(in srgb, var(--color-altus-red) 10%, var(--color-surface-card))" : "var(--color-surface-card)",
        boxShadow: [
          "inset 0 -1px 0 var(--color-hairline-strong)",
          dropTarget ? `inset ${fromLeft ? "-3px" : "3px"} 0 0 var(--color-altus-red)` : "",
        ].filter(Boolean).join(", "),
      }}
    >
      <div className="flex items-center justify-center gap-1 text-center leading-tight">
        <span
          draggable
          role="button"
          tabIndex={-1}
          aria-label={`Move ${period.label} column`}
          title="Drag to move this period column"
          onDragStart={(event) => {
            onDragStart();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", period.key);
          }}
          onDragEnd={onDragEnd}
          className="inline-flex cursor-grab text-ink-subtle opacity-40 transition-opacity hover:text-ink-strong active:cursor-grabbing group-hover/head:opacity-100"
        >
          <GripVertical size={12} strokeWidth={2.4} aria-hidden />
        </span>
        <div>
        <div>{period.label}</div>
        <div className="mt-0.5 text-[10px] font-semibold normal-case tracking-normal text-ink-subtle">{period.detail}</div>
        </div>
      </div>
    </th>
  );
}

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * WCC — WHEN (account holder, 2026-09-19): three choices when adding —
 *   Mon to Sat · Mon to Sun · Each Day of the Week (repeats on the days picked).
 * "Once a week" is offered only on the edit of a compliance that already is
 * one, so saving it never silently turns it into a daily one.
 */
type WccWhen = "mon_sat" | "mon_sun" | "each_day" | "weekly";
const MON_TO_SAT = [0, 1, 2, 3, 4, 5];
const MON_TO_SUN = [0, 1, 2, 3, 4, 5, 6];

function wccWhenOf(row: ComplianceRow | null): WccWhen {
  if (!row) return "mon_sat";
  if (row.scheduleKind === "weekly") return "weekly";
  if (row.weekdays === 0b0111111) return "mon_sat";
  // A mask of 0 is due every day — the same as all seven.
  if (row.weekdays === 0 || row.weekdays === 0b1111111) return "mon_sun";
  return "each_day";
}

/** What the Target field will do, in words, for what is typed and the title. */
function targetHint(target: string, title: string): string {
  const t = target.trim();
  if (t === "") {
    const fromTitle = targetFromTitle(title);
    return fromTitle && fromTitle > 1
      ? `Blank — the title's ${fromTitle} is used, so Done asks how many.`
      : "Blank or 1 — simply Done, nothing counted.";
  }
  const c = checkQuantity(t);
  if (!c.ok || c.value < 1) return "A whole number, 1 or more.";
  return c.value === 1 ? "1 — simply Done, nothing counted." : `Done asks how many of ${c.value} were completed.`;
}

function bitsOf(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((b) => (mask & (1 << b)) !== 0);
}

/** A labelled field, in the New Task form's type and spacing. */
function DialogField({
  id,
  label,
  required,
  hint,
  className,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="text-[14px] font-bold tracking-[-0.005em] text-ink-strong">
        {label}
        {required && <span style={{ color: "rgb(168, 4, 0)" }}> *</span>}
      </label>
      {children}
      {hint && <span className="text-[12px] font-medium text-ink-subtle">{hint}</span>}
    </div>
  );
}

/**
 * THE ADD / EDIT POP-UP (account holder, 2026-09-18: "make the add a pop-up,
 * like New Task"). The New Task dialog's frame — the dimmed backdrop, the red
 * bar, the title, the round close button, a scrolling body — around the same
 * fields the inline form had, laid out on a two-column grid so every row lines
 * up: Employee · Section, then the Compliance across the full width, then when
 * it is due.
 */
function ItemDialog({
  open,
  onOpenChange,
  kind,
  row,
  manageable,
  defaultOwnerId,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ComplianceKind;
  row: ComplianceRow | null;
  manageable: ManageablePerson[];
  defaultOwnerId: string;
  onImport: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-section bg-surface-card shadow-xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => document.getElementById("cc-title")?.focus());
          }}
        >
          {/* Keyed on what is being edited, so the fields start fresh each time it opens. */}
          {open && (
            <ItemFormBody
              key={row?.key ?? "new"}
              kind={kind}
              row={row}
              manageable={manageable}
              defaultOwnerId={defaultOwnerId}
              onDone={() => onOpenChange(false)}
              onImport={onImport}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ItemFormBody({
  kind,
  row,
  manageable,
  defaultOwnerId,
  onDone,
  onImport,
}: {
  kind: ComplianceKind;
  row: ComplianceRow | null;
  manageable: ManageablePerson[];
  defaultOwnerId: string;
  onDone: () => void;
  onImport: () => void;
}) {
  const router = useRouter();
  const [ownerId, setOwnerId] = React.useState(
    row?.ownerId ?? (manageable.some((p) => p.id === defaultOwnerId) ? defaultOwnerId : (manageable[0]?.id ?? "")),
  );
  const [title, setTitle] = React.useState(row?.title ?? "");
  const [section, setSection] = React.useState(row?.section ?? "");
  const [when, setWhen] = React.useState<WccWhen>(wccWhenOf(row));
  /* The days picked for Each Day of the Week (or an older Once a week). */
  const [days, setDays] = React.useState<number[]>(() => {
    const w = wccWhenOf(row);
    return row && (w === "each_day" || w === "weekly") ? bitsOf(row.weekdays) : [];
  });
  /* MCC — how often, its deadline day(s) (31 = the month's last day), and
     for a frequency that skips months, a month it is due in. */
  const [mccFreq, setMccFreq] = React.useState<MccFrequency>(row?.mcc?.frequency ?? "monthly");
  const [mccDays, setMccDays] = React.useState<number[]>(row?.mcc?.days ?? defaultDays("monthly"));
  const [startMonth, setStartMonth] = React.useState<number>(row?.mcc?.startMonth ?? new Date().getMonth() + 1);
  const pickFrequency = (f: MccFrequency) => {
    setMccFreq(f);
    // Keep the day when the count of deadlines stays the same; else start from the usual ones.
    if (DEADLINES_PER_MONTH[f] !== mccDays.length) setMccDays(defaultDays(f));
  };
  const mccCheck = normalizeMccSchedule({ frequency: mccFreq, days: mccDays, startMonth });
  /* The Target, shown as stored ("25.00" reads 25). Sent only when changed, so
     saving other fields never disturbs a Target the DCC Masters set. */
  const storedTarget = row?.targetNumber ? String(Number(row.targetNumber)) : "";
  const [target, setTarget] = React.useState(storedTarget);
  const [unit, setUnit] = React.useState(row?.unit ?? "");
  /* WCC's Mins, sent only when changed — like the Target. */
  const storedMinutes = row?.minutes != null ? String(row.minutes) : "";
  const [mins, setMins] = React.useState(storedMinutes);
  const minsCheck = parseMinutes(mins);
  const [saving, setSaving] = React.useState(false);
  const checklist = kind === "wcc" ? "Weekly Compliance Checklist" : "Monthly Compliance Checklist";
  const ownerName = manageable.find((p) => p.id === ownerId)?.name ?? row?.ownerName ?? "";

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || !ownerId) return;
    if (kind === "mcc" && !mccCheck.ok) {
      fireToast({ message: mccCheck.error, type: "error" });
      return;
    }
    if (kind === "wcc" && when === "each_day" && days.length === 0) {
      fireToast({ message: "Pick the days it repeats on.", type: "error" });
      return;
    }
    let targetQuantity: number | null | undefined;
    if (target.trim() !== storedTarget) {
      if (target.trim() === "") targetQuantity = null;
      else {
        const c = checkQuantity(target);
        if (!c.ok || c.value < 1) {
          fireToast({ message: "The target must be a whole number, 1 or more — or blank for none.", type: "error" });
          return;
        }
        targetQuantity = c.value;
      }
    }
    let minutes: number | null | undefined;
    if (kind === "wcc" && mins.trim() !== storedMinutes) {
      if (!minsCheck.ok) {
        fireToast({ message: minsCheck.error, type: "error" });
        return;
      }
      minutes = minsCheck.value;
    }
    setSaving(true);
    try {
      const res = await saveComplianceItem({
        itemId: row?.itemId,
        ownerEmployeeId: ownerId,
        kind,
        title,
        section: section || null,
        wccMode: when === "weekly" ? "weekly" : "days",
        weekdays: when === "mon_sat" ? MON_TO_SAT : when === "mon_sun" ? MON_TO_SUN : days,
        ...(kind === "mcc"
          ? {
              mccFrequency: mccFreq,
              mccDays: mccDays.map((d) => (d >= MONTH_END ? null : d)),
              mccStartMonth: needsStartMonth(mccFreq) ? startMonth : null,
            }
          : {}),
        targetQuantity,
        unit: unit.trim() !== (row?.unit ?? "") ? unit.trim() || null : undefined,
        minutes,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: row ? "Compliance saved." : `Added to ${ownerName}'s ${kind.toUpperCase()}.`, type: "success" });
      onDone();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const whenHint =
    when === "mon_sat"
      ? "Due every day, Monday to Saturday — one row a day."
      : when === "mon_sun"
        ? "Due every day of the week, Sunday too — one row a day."
        : when === "each_day"
          ? days.length
            ? `Repeats every ${[...days].sort().map((b) => WD[b]).join(", ").replace(/, ([^,]*)$/, " & $1")} — one row on each.`
            : "Pick the days it repeats on."
          : days.length
            ? `Once a week; the deadline is the last chosen day (${WD[[...days].sort()[days.length - 1]!]}).`
            : "Once a week, any day; the deadline is Saturday.";

  return (
    <form onSubmit={(e) => void save(e)} className="flex min-h-0 flex-col">
      {/* Header — the New Task dialog's red bar, title and close. */}
      <div
        className="relative px-8 py-5 max-md:px-5 max-md:py-4"
        style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
        <Dialog.Title
          className="pr-14 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px, 2.4vw, 30px)", letterSpacing: "-0.022em", lineHeight: 1.05 }}
        >
          {row ? "Edit Compliance" : kind === "wcc" ? "New Weekly Compliance" : "New Monthly Compliance"}
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-[14.5px] font-semibold text-ink-muted">
          {row ? `On ${row.ownerName}'s ${checklist}.` : `Goes on the ${checklist} of the person you pick.`}
        </Dialog.Description>
        <div className="absolute right-5 top-4 flex items-center gap-2.5">
          {!row && (
            <button
              type="button"
              onClick={onImport}
              title={`Bulk-import ${kind.toUpperCase()} compliances from CSV or Excel`}
              className="inline-flex h-10 items-center gap-2 rounded-pill border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong transition-colors hover:bg-surface-soft max-md:px-3"
            >
              <Upload size={17} strokeWidth={2.2} className="text-altus-red" />
              <span className="max-md:hidden">Import</span>
            </button>
          )}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-all hover:bg-surface-soft"
            >
              <X size={20} strokeWidth={2.4} />
            </button>
          </Dialog.Close>
        </div>
      </div>

      {/* Body — two equal columns; the compliance itself takes the full width. */}
      <div className="grid min-h-0 grid-cols-2 gap-x-4 gap-y-4 overflow-y-auto px-8 py-5 max-md:grid-cols-1 max-md:px-5">
        <DialogField id="cc-owner" label="Employee" required hint={row ? "A compliance stays with the person it was given to." : undefined}>
          <select id="cc-owner" value={ownerId} disabled={Boolean(row)} onChange={(e) => setOwnerId(e.target.value)} className="nt-input">
            {manageable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </DialogField>
        <DialogField id="cc-section" label="Section">
          <input id="cc-section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Calls, Reporting" className="nt-input" maxLength={120} />
        </DialogField>

        <DialogField id="cc-title" label="Compliance" required className="col-span-2 max-md:col-span-1">
          <textarea
            id="cc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What must be done"
            rows={2}
            maxLength={300}
            className="nt-input min-h-[64px] resize-y"
          />
        </DialogField>

        <DialogField id="cc-target" label="Target (how many)" hint={targetHint(target, title)}>
          <input
            id="cc-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder={(() => {
              const fromTitle = targetFromTitle(title);
              return fromTitle && fromTitle > 1 ? `${fromTitle} (from the title)` : "e.g. 25";
            })()}
            maxLength={String(MAX_QUANTITY).length}
            className="nt-input"
          />
        </DialogField>
        <DialogField id="cc-unit" label="Unit" hint="What is counted — shown beside the count.">
          <input id="cc-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. emails, calls" maxLength={40} className="nt-input" />
        </DialogField>

        {kind === "wcc" ? (
          <>
            <DialogField id="cc-when" label="When" required hint={when === "mon_sat" || when === "mon_sun" ? whenHint : undefined}>
              <select id="cc-when" value={when} onChange={(e) => setWhen(e.target.value as WccWhen)} className="nt-input">
                <option value="mon_sat">Mon to Sat</option>
                <option value="mon_sun">Mon to Sun</option>
                <option value="each_day">Each Day of the Week — pick the days</option>
                {wccWhenOf(row) === "weekly" && <option value="weekly">Once a week, on any of these days</option>}
              </select>
            </DialogField>
            <DialogField
              id="cc-mins"
              label="Mins"
              hint={
                !minsCheck.ok ? (
                  <span style={{ color: "#B91C1C" }}>{MINUTES_WORDS}</span>
                ) : minsCheck.value === null ? (
                  "How many minutes it takes each time — added up for each day on the checklist."
                ) : (
                  `${minutesText(minsCheck.value)} each time it is due.`
                )
              }
            >
              <input
                id="cc-mins"
                value={mins}
                onChange={(e) => setMins(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 15"
                maxLength={12}
                className="nt-input"
              />
            </DialogField>
            {(when === "each_day" || when === "weekly") && (
              <DialogField label="Days" required={when === "each_day"} hint={whenHint} className="col-span-2 max-md:col-span-1">
                <div className="grid max-w-[440px] grid-cols-7 gap-1.5" role="group" aria-label="Days">
                  {WD.map((d, b) => {
                    const on = days.includes(b);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== b) : [...cur, b].sort()))}
                        className="h-[38px] rounded-lg border text-[13px] font-bold transition-colors"
                        style={
                          on
                            ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)", color: "#fff" }
                            : { background: "#fff", borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }
                        }
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </DialogField>
            )}
          </>
        ) : (
          <>
            <DialogField id="cc-frequency" label="Frequency" required>
              <select id="cc-frequency" value={mccFreq} onChange={(e) => pickFrequency(e.target.value as MccFrequency)} className="nt-input">
                {MCC_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {MCC_FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
            </DialogField>
            {needsStartMonth(mccFreq) ? (
              <DialogField id="cc-month" label="Due month" required hint="A month it is due in — the others follow from it.">
                <select id="cc-month" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className="nt-input">
                  {MONTH_LONG.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </DialogField>
            ) : (
              <div className="max-md:hidden" aria-hidden />
            )}
            <DialogField
              label={mccDays.length > 1 ? "Deadline days" : "Deadline day"}
              required
              className="col-span-2 max-md:col-span-1"
              hint={
                mccCheck.ok ? (
                  <span>
                    <b className="font-bold text-ink-soft">{MCC_FREQUENCY_LABEL[mccFreq]}</b> — {mccDetail(mccCheck.schedule)}. A day past a short month&apos;s end falls on its last day.
                  </span>
                ) : (
                  <span style={{ color: "#B91C1C" }}>{mccCheck.error}</span>
                )
              }
            >
              <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1" role="group" aria-label="Deadline days">
                {mccDays.map((d, i) => (
                  <label key={i} className="flex flex-col gap-0.5">
                    {mccDays.length > 1 && <span className="text-[11.5px] font-bold text-ink-subtle">{["1st", "2nd", "3rd"][i]} deadline</span>}
                    <select
                      value={Math.min(d, MONTH_END)}
                      aria-label={mccDays.length > 1 ? `${["1st", "2nd", "3rd"][i]} deadline day` : "Deadline day"}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMccDays((cur) => cur.map((x, j) => (j === i ? v : x)));
                      }}
                      className="nt-input"
                    >
                      {Array.from({ length: 30 }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>
                          Day {n}
                        </option>
                      ))}
                      <option value={MONTH_END}>Last day of the month</option>
                    </select>
                  </label>
                ))}
              </div>
            </DialogField>
          </>
        )}
      </div>

      {/* Footer — the actions stay put while the body scrolls. */}
      <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-8 py-4 max-md:px-5">
        <Dialog.Close asChild>
          <button type="button" className="h-10 rounded-lg border border-hairline-strong bg-white px-5 text-[14px] font-bold text-ink-muted hover:bg-surface-soft">
            Cancel
          </button>
        </Dialog.Close>
        <button
          type="submit"
          disabled={saving || !title.trim() || !ownerId}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : row ? <Pencil size={15} /> : <Plus size={16} strokeWidth={2.6} />}
          {row ? "Save changes" : "Add compliance"}
        </button>
      </div>
    </form>
  );
}
