"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { ApproverChip } from "@/components/status/approver-chip";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { DOER_STATUSES, doerLabel, doerStyle, type DoerStatus } from "@/lib/compliance/status";
import { formatDeadline, type ComplianceKind } from "@/lib/compliance/schedule";
import type { ComplianceRow, ComplianceSummary } from "@/lib/compliance/rows";
import {
  COLUMNS,
  DEFAULT_ORDER,
  columnLabel,
  moveColumn,
  reconcileOrder,
  sortRows,
  visibleColumns,
  type ColKey,
} from "@/lib/compliance/columns";
import { ariaSort, directionWords, nextSort, type SortState } from "@/lib/ui/column-sort";
import type { BoardGroup } from "@/lib/queries/compliance-board";
import {
  archiveComplianceItem,
  saveComplianceItem,
  setComplianceApprover,
  setComplianceDoer,
} from "@/app/(app)/dcc/compliance-actions";
import { useAutoHeight } from "@/components/ui/use-auto-height";

/**
 * THE WCC / MCC TABLE — the Accounts checklist's shape with the WMS columns
 * (account holder, 2026-09-18):
 *
 *   S. No. · [Employee] · Compliance · Frequency · Deadline · Doer Status ·
 *   Actual Date · +/- Days · Approver Status · Doer Notes · Approver Notes
 *
 * Deadline and Actual Date read DD-MMM-YYYY. The actual date is the day the
 * doer marked it Done, stamped by the server; +/- days is that against the
 * deadline, and a row still open past its deadline counts its lateness up.
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
  summary: ComplianceSummary;
  multiPerson: boolean;
  /** People the viewer may add a compliance for. */
  manageable: { id: string; name: string }[];
  /** Whose compliance a new one defaults to. */
  defaultOwnerId: string;
  today: string;
  /** Who is looking — their column order is saved under their id. */
  viewerId: string;
}

/** A heading pinned to the top of the scroll box, as the Tasks table's read:
 *  the words in full, in Title Case ("Approver Status"), bold and slightly
 *  spaced. The line under it is a shadow, because a border on a sticky cell
 *  stays behind in a collapsed table. */
const HEAD =
  "group/head sticky top-0 z-20 bg-surface-soft px-3 py-2.5 text-left text-[13px] font-bold tracking-[0.02em] normal-case text-ink-soft whitespace-nowrap";

export function ComplianceBoard({
  kind,
  rows,
  groups,
  summary,
  multiPerson,
  manageable,
  defaultOwnerId,
  today,
  viewerId,
}: ComplianceBoardProps) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ComplianceRow | "new" | null>(null);
  /* The status chips are filters — any number of them at once. Empty = all. */
  const [statuses, setStatuses] = React.useState<Set<StatusFilter>>(new Set());
  /* A whole team is thousands of cells — collapsed until opened, all but the first. */
  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(multiPerson ? groups.slice(0, 1).map((g) => g.key) : groups.map((g) => g.key)),
  );

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
  const cols = visibleColumns(order, multiPerson);
  const reordered = order.join() !== DEFAULT_ORDER.join();

  const byKey = React.useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
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
    (statuses.size === 0 || statuses.has(r.doerStatus ?? "none")) &&
    (!needle ||
      [r.title, r.section, r.ownerName, r.doerNotes, r.approverNotes].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const statusCounts = React.useMemo(() => {
    const m = new Map<StatusFilter, number>();
    for (const r of rows) m.set(r.doerStatus ?? "none", (m.get(r.doerStatus ?? "none") ?? 0) + 1);
    return m;
  }, [rows]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) fireToast({ message: res.error ?? "That did not save.", type: "error" });
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <SummaryStrip summary={summary} kind={kind} />

      <div className="flex flex-wrap items-center gap-3">
        {/* The house search: a magnifier until clicked, the full field while
            open, a red dot on the magnifier while it is still filtering. */}
        <CollapsibleSearch scope={multiPerson ? "compliance, person, notes" : "compliance, notes"}>
          <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
            <Search size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={multiPerson ? "Search compliance, person, notes" : "Search compliance, notes"}
              aria-label="Search this checklist"
              className="w-full bg-transparent py-2 text-[14px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="shrink-0 rounded p-0.5 text-ink-subtle hover:text-ink-strong">
                <X size={14} />
              </button>
            )}
          </div>
        </CollapsibleSearch>
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
          onClear={() => setStatuses(new Set())}
        />
        {manageable.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            <Plus size={16} strokeWidth={2.6} /> Add compliance
          </button>
        )}
      </div>

      <ItemDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        kind={kind}
        row={editing === "new" ? null : editing}
        manageable={manageable}
        defaultOwnerId={defaultOwnerId}
      />

      {/* What the sort and the column order are doing, and how to undo each. */}
      {(sort || reordered) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-surface-soft px-3.5 py-2 text-[12.5px] text-ink-soft">
          <ArrowUpDown size={14} className="shrink-0 text-ink-subtle" />
          {sort ? (
            <span>
              Sorted by <b className="font-semibold text-ink-strong">{columnLabel(sort.key, kind)}</b> (
              {directionWords(sort.dir, COLUMNS[sort.key].sortKind)}) within each group
            </span>
          ) : (
            <span>Columns in your own order — drag a heading by its grip to move it.</span>
          )}
          <span className="ml-auto flex gap-2">
            {sort && (
              <button type="button" onClick={() => setSort(null)} className="rounded-lg border border-hairline-strong bg-white px-2.5 py-1 text-[12px] font-bold text-ink-soft hover:text-ink-strong">
                Back to checklist order
              </button>
            )}
            {reordered && (
              <button type="button" onClick={() => saveOrder(DEFAULT_ORDER)} className="inline-flex items-center gap-1 rounded-lg border border-hairline-strong bg-white px-2.5 py-1 text-[12px] font-bold text-ink-soft hover:text-ink-strong">
                <RotateCcw size={12} /> Reset columns
              </button>
            )}
          </span>
        </div>
      )}

      {/* Its own scroll box, both ways — the sideways scrollbar stays on screen
          instead of under the last row, and the headings stay pinned. */}
      <div
        className="table-scroll table-scroll-bold overflow-auto rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", maxHeight: "max(420px, calc(100vh - 260px))" }}
      >
        <table
          className="border-collapse text-left"
          style={{ tableLayout: "fixed", width: cols.reduce((n, k) => n + COLUMNS[k].width, 0) }}
        >
          <colgroup>
            {cols.map((k) => (
              <col key={k} style={{ width: COLUMNS[k].width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cols.map((k) => (
                <HeadCell
                  key={k}
                  col={k}
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
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-5 py-14 text-[14px] font-semibold text-ink-muted">
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
                <td colSpan={cols.length} className="px-5 py-10 text-[14px] font-semibold text-ink-muted">
                  <span className="sticky left-5">Nothing matches the search and status filters.</span>
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const groupRows = g.rowKeys.map((k) => byKey.get(k)!).filter(Boolean);
              const shown = sortRows(groupRows.filter(matches), sort);
              if (filtering && shown.length === 0) return null;
              const isOpen = open.has(g.key) || filtering;
              const filled = groupRows.filter((r) => r.doerStatus !== null).length;
              const done = groupRows.filter((r) => r.doerStatus === "done").length;
              return (
                <React.Fragment key={g.key}>
                  <tr>
                    <td colSpan={cols.length} className="p-0">
                      <button
                        type="button"
                        onClick={() =>
                          setOpen((s) => {
                            const n = new Set(s);
                            if (n.has(g.key)) n.delete(g.key);
                            else n.add(g.key);
                            return n;
                          })
                        }
                        className="block w-full px-3 py-2 text-left text-[12px] font-bold uppercase tracking-wider"
                        style={{ background: "color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card))", color: "var(--color-altus-red-deep)" }}
                      >
                        {/* Sticky, so the group's name stays in view when the table is scrolled sideways. */}
                        <span className="sticky left-3 inline-flex items-center gap-2">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {g.label}
                          <span className="font-semibold normal-case tracking-normal opacity-75">
                            · {groupRows.length} due · {filled} filled · {done} done
                          </span>
                        </span>
                      </button>
                    </td>
                  </tr>
                  {isOpen &&
                    shown.map((r) => (
                      <Row
                        key={r.key}
                        row={r}
                        cols={cols}
                        serial={serialOf.get(r.key) ?? 0}
                        today={today}
                        busy={busy}
                        onRun={run}
                        onEdit={() => setEditing(r)}
                      />
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
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
}: {
  col: ColKey;
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
}) {
  const def = COLUMNS[col];
  const dir = sort?.key === col ? sort.dir : null;
  const movable = def.movable;
  return (
    <th
      scope="col"
      aria-sort={def.sortable ? ariaSort(sort, col) : undefined}
      className={HEAD}
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
        boxShadow: [
          "inset 0 -1px 0 var(--color-hairline-strong)",
          // Where the column will land — the edge it would arrive on.
          dropTarget ? `inset ${fromLeft ? "-3px" : "3px"} 0 0 var(--color-altus-red)` : "",
        ]
          .filter(Boolean)
          .join(", "),
        opacity: dragging === col ? 0.45 : 1,
      }}
    >
      <span className={`flex items-center gap-1 ${def.align === "right" ? "justify-end" : ""}`}>
        {movable && (
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

/* ── The +/- days report, as a strip ───────────────────────────────────── */

function SummaryStrip({ summary, kind }: { summary: ComplianceSummary; kind: ComplianceKind }) {
  const cell = (label: string, value: React.ReactNode, tone?: string) => (
    <div className="min-w-[110px] rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</div>
      <div className="mt-0.5 text-[18px] font-black tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2" aria-label={kind === "wcc" ? "WCC summary" : "MCC summary"}>
      {/* Counted over what is DUE BY TODAY — a deadline later this month is not
          yet unfilled. The chips below count every row on screen. */}
      {cell("Due by today", summary.due)}
      {cell("Filled", `${summary.filled}/${summary.due}`)}
      {cell("Not filled (due)", summary.notFilled, summary.notFilled ? "#B91C1C" : undefined)}
      {cell("Done", summary.done, "#047857")}
      {cell("On time", summary.onTime, "#047857")}
      {cell("Late", summary.late, summary.late ? "#B91C1C" : undefined)}
      {cell("Avg. days late", summary.avgLate === null ? "—" : `+${summary.avgLate}`)}
      {summary.ruledOut > 0 && cell("Cancelled / archived", summary.ruledOut)}
    </div>
  );
}

type StatusFilter = DoerStatus | "none";

/**
 * THE DOER STATUS CHIPS ARE FILTERS. Click one to show only those rows; click
 * more to add them; click again to drop one. "Not filled" is the first — the
 * rows nobody has touched, which is what a Team Lead looks for. Each chip
 * carries its count so an empty filter is visible before it is clicked.
 */
function StatusFilters({
  active,
  counts,
  onToggle,
  onClear,
}: {
  active: ReadonlySet<StatusFilter>;
  counts: ReadonlyMap<StatusFilter, number>;
  onToggle: (s: StatusFilter) => void;
  onClear: () => void;
}) {
  const chips: { key: StatusFilter; label: string; bg: string; ink: string; border: string; dot: string }[] = [
    { key: "none", label: "Not filled", bg: "#FFFFFF", ink: "#B91C1C", border: "#FCA5A5", dot: "#DC2626" },
    ...DOER_STATUSES.map((s) => {
      const t = doerStyle(s);
      return { key: s as StatusFilter, label: doerLabel(s), bg: t.bg, ink: t.ink, border: t.border, dot: t.dot };
    }),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by Doer Status">
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
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold transition-all hover:brightness-95 ${
              active.size > 0 && !on ? "opacity-45" : ""
            }`}
            style={{
              background: c.bg,
              color: c.ink,
              borderColor: on ? c.ink : c.border,
              borderStyle: c.key === "none" && !on ? "dashed" : "solid",
              boxShadow: on ? `0 0 0 2px color-mix(in srgb, ${c.dot} 35%, transparent)` : undefined,
            }}
          >
            <span className="inline-block size-[6px] rounded-full" style={{ background: c.dot }} />
            {c.label}
            <span className="tabular-nums opacity-70">{n}</span>
          </button>
        );
      })}
      {active.size > 0 && (
        <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold text-ink-soft hover:text-altus-red">
          <X size={12} /> Clear
        </button>
      )}
    </div>
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
}: {
  row: ComplianceRow;
  cols: ColKey[];
  serial: number;
  today: string;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  onEdit: () => void;
}) {
  const router = useRouter();
  const saving = busy === r.key;
  const actual = formatActual(r.doneAt);
  const overdueUnfilled = r.doerStatus === null && r.deadline < today;
  const ruledOut = r.approver === "cancelled" || r.approver === "archived";

  const cell = (k: ColKey): React.ReactNode => {
    switch (k) {
      case "sr":
        return <td key={k} className="px-3 py-2.5 text-[13px] font-semibold tabular-nums text-ink-subtle">{serial}</td>;
      case "employee":
        return <td key={k} className="px-3 py-2.5 text-[13.5px] font-semibold text-ink-strong">{r.ownerName}</td>;
      case "compliance":
        return (
          <td key={k} className="px-3 py-2.5">
            <div className="text-[14px] font-semibold text-ink-strong">{r.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {r.section && <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-bold text-ink-soft">{r.section}</span>}
              {r.fromMaster && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-ink-subtle" style={{ background: "var(--color-surface-track, #eef2f7)" }} title="Given by the position's DCC Master — change it there.">
                  <Lock size={9} /> {r.fromMaster} master
                </span>
              )}
            </div>
          </td>
        );
      case "frequency":
        return <td key={k} className="px-3 py-2.5 text-[13px] text-ink-soft">{r.schedule}</td>;
      case "deadline":
        return (
          <td key={k} className="px-3 py-2.5 text-[13.5px] font-bold tabular-nums whitespace-nowrap" style={{ color: overdueUnfilled ? "#B91C1C" : "var(--color-ink-strong)" }}>
            {formatDeadline(r.deadline)}
          </td>
        );
      case "doerStatus":
        return (
          <td key={k} className="px-3 py-2">
            <DoerCell
              status={r.doerStatus}
              disabled={!r.canFill || busy !== null}
              onSet={(s) => onRun(r.key, () => setComplianceDoer({ itemId: r.itemId, deadline: r.deadline, doerStatus: s }))}
            />
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
            <VarianceChip days={r.variance} running={r.running} />
          </td>
        );
      case "approver":
        return (
          <td key={k} className="px-3 py-2">
            <ApproverChip
              shown={r.approver}
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
            <NoteCell
              value={r.doerNotes}
              editable={r.canFill && busy === null}
              onCommit={(v) => onRun(r.key, () => setComplianceDoer({ itemId: r.itemId, deadline: r.deadline, notes: v }))}
            />
          </td>
        );
      case "approverNotes":
        return (
          <td key={k} className="px-3 py-2">
            <NoteCell
              value={r.approverNotes}
              editable={r.canApproverNotes && busy === null}
              onCommit={(v) => onRun(r.key, () => setComplianceApprover({ itemId: r.itemId, deadline: r.deadline, notes: v }))}
            />
          </td>
        );
      case "actions":
        return (
          <td key={k} className="px-2 py-2 text-right whitespace-nowrap">
            {r.canManage && (
              <>
                <button type="button" onClick={onEdit} aria-label="Edit compliance" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Remove compliance"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Remove "${r.title}" from ${r.ownerName}'s checklist? What was filled stays on record.`)) return;
                    void onRun(r.key, () => archiveComplianceItem(r.itemId));
                  }}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </td>
        );
    }
  };

  return (
    <tr
      className={`align-top transition-colors hover:bg-surface-soft ${ruledOut ? "opacity-60" : ""}`}
      style={{ borderBottom: "1px solid var(--color-hairline)" }}
    >
      {cols.map(cell)}
    </tr>
  );
}

function DoerCell({ status, disabled, onSet }: { status: DoerStatus | null; disabled: boolean; onSet: (s: DoerStatus) => void }) {
  const tone = status ? doerStyle(status) : null;
  return (
    <select
      value={status ?? ""}
      disabled={disabled}
      aria-label="Doer Status"
      onChange={(e) => e.target.value && onSet(e.target.value as DoerStatus)}
      className="min-w-[130px] cursor-pointer rounded-full border px-2.5 py-1 text-[12.5px] font-bold outline-none disabled:cursor-default"
      style={
        tone
          ? { background: tone.bg, color: tone.ink, borderColor: tone.border }
          : { background: "#FFF", color: "#B91C1C", borderColor: "#FCA5A5", borderStyle: "dashed" }
      }
    >
      {status === null && <option value="">Not filled</option>}
      {DOER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {doerLabel(s)}
        </option>
      ))}
    </select>
  );
}

function VarianceChip({ days, running }: { days: number | null; running: boolean }) {
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

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ComplianceKind;
  row: ComplianceRow | null;
  manageable: { id: string; name: string }[];
  defaultOwnerId: string;
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
}: {
  kind: ComplianceKind;
  row: ComplianceRow | null;
  manageable: { id: string; name: string }[];
  defaultOwnerId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [ownerId, setOwnerId] = React.useState(
    row?.ownerId ?? (manageable.some((p) => p.id === defaultOwnerId) ? defaultOwnerId : (manageable[0]?.id ?? "")),
  );
  const [title, setTitle] = React.useState(row?.title ?? "");
  const [section, setSection] = React.useState(row?.section ?? "");
  const [wccMode, setWccMode] = React.useState<"days" | "weekly">(row?.scheduleKind === "weekly" ? "weekly" : "days");
  const [days, setDays] = React.useState<number[]>(row ? bitsOf(row.weekdays) : [0, 1, 2, 3, 4, 5]);
  const [monthDay, setMonthDay] = React.useState<number | null>(row ? row.monthDay : 5);
  const [saving, setSaving] = React.useState(false);
  const checklist = kind === "wcc" ? "Weekly Compliance Checklist" : "Monthly Compliance Checklist";
  const ownerName = manageable.find((p) => p.id === ownerId)?.name ?? row?.ownerName ?? "";

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || !ownerId) return;
    setSaving(true);
    try {
      const res = await saveComplianceItem({
        itemId: row?.itemId,
        ownerEmployeeId: ownerId,
        kind,
        title,
        section: section || null,
        wccMode,
        weekdays: days,
        monthDay,
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
    kind === "mcc"
      ? "One row a month. A 31st falls on the 30th in a 30-day month."
      : wccMode === "days"
        ? "One row on each chosen day; the deadline is that day."
        : days.length
          ? `One row a week; the deadline is the last chosen day (${WD[[...days].sort()[days.length - 1]!]}).`
          : "One row a week, any day; the deadline is Saturday.";

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
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Close"
            className="absolute right-5 top-4 inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-all hover:bg-surface-soft"
          >
            <X size={20} strokeWidth={2.4} />
          </button>
        </Dialog.Close>
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

        {kind === "wcc" ? (
          <>
            <DialogField id="cc-when" label="When" required>
              <select id="cc-when" value={wccMode} onChange={(e) => setWccMode(e.target.value as "days" | "weekly")} className="nt-input">
                <option value="days">Due on each of these days</option>
                <option value="weekly">Once a week, on any of these days</option>
              </select>
            </DialogField>
            <DialogField label="Days" hint={whenHint}>
              <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Days">
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
          </>
        ) : (
          <DialogField id="cc-day" label="Deadline each month" required hint={whenHint}>
            <select id="cc-day" value={monthDay ?? "last"} onChange={(e) => setMonthDay(e.target.value === "last" ? null : Number(e.target.value))} className="nt-input">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
              <option value="last">Last day of the month</option>
            </select>
          </DialogField>
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
