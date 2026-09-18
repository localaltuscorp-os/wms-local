"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  ListChecks,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type {
  ChecklistMasterItem,
  ChecklistPersonRow,
  ChecklistTemplateRow,
} from "@/lib/operations/checklist";
import {
  OFFSET_MAX,
  OFFSET_MIN,
  PHASE_LABELS,
  PHASE_ORDER,
  formatOffset,
  parseOffset,
  phaseFor,
  type ChecklistPhase,
} from "@/lib/operations/checklist-dates";
import { SubjectSelect } from "@/components/tasks/subject-select";
import { ColumnGrip, headShadow, useColumnDrag, useSavedColumnOrder } from "@/components/ui/column-drag";
import { ChecklistTaskDialog } from "@/components/operations/checklist/checklist-task-dialog";
import { ChecklistBulkUpload } from "@/components/operations/checklist/checklist-bulk-upload";
import { NewMasterDialog, TypeBadge, TypeToggle } from "@/components/operations/masters/checklist-master-picker";
import {
  createTemplateItem,
  duplicateChecklistTemplate,
  removeChecklistItem,
  updateChecklistItem,
  updateChecklistTemplate,
} from "@/app/(app)/operations/checklist/actions";

/**
 * CHECKLIST MASTERS — the reusable checklists, edited directly.
 *
 * Which master is open is a dropdown beside the page heading
 * (checklist-master-picker.tsx); this is the open master, across the full
 * width: its name, type and description, then its rows. Rows save per cell on
 * blur, like the checklist grid — a master is edited a line at a time, and a
 * whole-form Save would lose one person's edit to another's refresh.
 *
 * The rows are the checklist grid's twin (account holder, 2026-09-18): grouped
 * Before / During / After on an event-linked master, "+ Add task" and Bulk
 * upload on each group's bar, and columns each person can drag into their own
 * order.
 */

const ACCENT = "#B91C1C";
const ACCENT_DEEP = "#A80400";
const BASE = "/operations/masters/checklist";

const CELL =
  "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none disabled:hover:border-transparent";

type Result = { ok: true } | { ok: false; error: string };

/** Run an action: toast its error, refresh on success. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(
    async <T extends Result>(fn: () => Promise<T>, success?: string): Promise<T | null> => {
      setBusy(true);
      try {
        const res = await fn();
        const r = res as Result;
        if (!r.ok) {
          fireToast({ message: r.error, type: "error" });
          return null;
        }
        if (success) fireToast({ message: success, type: "success" });
        router.refresh();
        return res;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { busy, run };
}

export function ChecklistMasters({
  templates,
  selected,
  items,
  people,
  canEdit,
  meId,
  subjects = [],
  canAddRoster = false,
}: {
  templates: ChecklistTemplateRow[];
  selected: ChecklistTemplateRow | null;
  items: ChecklistMasterItem[];
  people: ChecklistPersonRow[];
  canEdit: boolean;
  /** Whose column order to remember. */
  meId: string;
  /** The WMS Tasks subject roster (Admin Panel → Subjects) — the Subject column's choices. */
  subjects?: string[];
  /** May this viewer add a subject to the roster from the picker? */
  canAddRoster?: boolean;
}) {
  const [creating, setCreating] = React.useState(false);

  if (!selected) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-[14px] font-semibold text-slate-700">
          {templates.length === 0 ? "No master checklists yet" : "No master open"}
        </p>
        <p className="mt-1 text-[13px] text-slate-500">
          A master is a reusable checklist. Build it once here; every new checklist copies its rows.
          {!canEdit && templates.length === 0 && " An admin creates these."}
        </p>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: ACCENT }}
            >
              <Plus className="h-4 w-4" /> New master
            </button>
            <NewMasterDialog open={creating} onOpenChange={setCreating} />
          </>
        )}
      </div>
    );
  }

  return (
    <MasterDetail
      master={selected}
      items={items}
      people={people}
      canEdit={canEdit}
      meId={meId}
      subjects={subjects}
      canAddRoster={canAddRoster}
    />
  );
}

/* ── The columns ──────────────────────────────────────────────────────────── */

type MasterCol = "sr" | "activity" | "subject" | "day" | "doer" | "backup" | "instructions" | "fileLink";

const MASTER_COLUMNS: readonly MasterCol[] = [
  "sr",
  "activity",
  "subject",
  "day",
  "doer",
  "backup",
  "instructions",
  "fileLink",
];

/** The headings — the WMS words, as the checklist grid spells them. */
const MASTER_LABEL: Record<MasterCol, string> = {
  sr: "S. No.",
  activity: "Task",
  subject: "Subject",
  day: "Day",
  doer: "Doer",
  backup: "Backup",
  instructions: "Instructions",
  fileLink: "File link",
};

const MASTER_WIDTH: Record<MasterCol, number> = {
  sr: 84,
  activity: 330,
  subject: 190,
  day: 150,
  doer: 190,
  backup: 190,
  instructions: 260,
  fileLink: 220,
};
const DELETE_COL = 56;

/** A heading pinned to the top of the scroll box; its rule is a shadow (see headShadow). */
const STICKY_HEAD =
  "group/head sticky top-0 z-20 bg-slate-50 px-0 py-0 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500";

/** The Day a task added from a group's bar starts on. */
function phaseOffset(phase: ChecklistPhase | null, isEvent: boolean): number | null {
  if (!isEvent || !phase || phase === "undated") return null;
  return phase === "before" ? -1 : phase === "during" ? 0 : 1;
}

/* ── One master ───────────────────────────────────────────────────────────── */

function MasterDetail({
  master,
  items,
  people,
  canEdit,
  meId,
  subjects,
  canAddRoster,
}: {
  master: ChecklistTemplateRow;
  items: ChecklistMasterItem[];
  people: ChecklistPersonRow[];
  canEdit: boolean;
  meId: string;
  subjects: string[];
  canAddRoster: boolean;
}) {
  const router = useRouter();
  const { busy, run } = useAction();
  const nameOf = React.useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const phaseCounts = React.useMemo(() => {
    const c: Record<ChecklistPhase, number> = { before: 0, during: 0, after: 0, undated: 0 };
    for (const it of items) c[phaseFor(it.offsetDays)]++;
    return c;
  }, [items]);
  const withDoer = items.filter((i) => i.doerId).length;

  /* Column order — each person's own, kept in their browser. Day only exists
     on an event-linked master; its place in the order is kept either way. */
  const columns = useSavedColumnOrder(`altus.checklist-masters.columnOrder.v1:${meId}`, MASTER_COLUMNS);
  const drag = useColumnDrag(columns.order, columns.save);
  const cols = columns.order.filter((k) => k !== "day" || master.isEvent);
  const colSpan = cols.length + (canEdit ? 1 : 0);
  const tableWidth = cols.reduce((n, k) => n + MASTER_WIDTH[k], 0) + (canEdit ? DELETE_COL : 0);

  /* Groups — Before / During / After on an event-linked master, as on the
     checklist grid; one list on a standing one. */
  const groups: { key: ChecklistPhase; label: string; rows: ChecklistMasterItem[] }[] = master.isEvent
    ? PHASE_ORDER.filter((p) => p !== "undated" || phaseCounts.undated > 0).map((p) => ({
        key: p,
        label: PHASE_LABELS[p],
        rows: items.filter((i) => phaseFor(i.offsetDays) === p),
      }))
    : [{ key: "undated", label: "All tasks", rows: items }];
  const [collapsed, setCollapsed] = React.useState<Set<ChecklistPhase>>(new Set());
  const toggle = (p: ChecklistPhase) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const [adding, setAdding] = React.useState<ChecklistPhase | null>(null);
  const [bulkFor, setBulkFor] = React.useState<ChecklistPhase | null>(null);
  const groupLabel = (p: ChecklistPhase | null) => (p && master.isEvent ? PHASE_LABELS[p] : null);

  const saveMaster = (patch: { name?: string; isEvent?: boolean; description?: string | null }) =>
    run(() => updateChecklistTemplate({ id: master.id, ...patch }));
  const saveRow = (id: string, patch: Record<string, unknown>) =>
    run(() => updateChecklistItem({ id, ...patch }));

  async function duplicate() {
    const name = window.prompt("Name the copy", `${master.name} (copy)`);
    if (!name?.trim()) return;
    const res = await run(() => duplicateChecklistTemplate({ id: master.id, name: name.trim() }), "Master copied.");
    if (res && res.ok) router.push(`${BASE}?t=${res.id}`);
  }

  async function retire() {
    const ok = window.confirm(
      `Retire “${master.name}”? It will no longer be offered when building a checklist. Checklists already built from it are not changed.`,
    );
    if (!ok) return;
    const res = await run(() => updateChecklistTemplate({ id: master.id, isActive: false }), "Master retired.");
    if (res) router.push(BASE);
  }

  /** One row's cells by column, so the row follows the dragged order. */
  function cellsOf(it: ChecklistMasterItem, n: number): Record<MasterCol, React.ReactNode> {
    return {
      sr: (
        <td key="sr" className="px-3 py-2.5 tabular-nums text-slate-400">
          {n}
        </td>
      ),
      activity: (
        <td key="activity" className="px-1.5 py-1">
          {canEdit ? (
            <TextCell
              value={it.title}
              required
              ariaLabel="Task"
              onCommit={(v) => v && void saveRow(it.id, { title: v })}
              className={`${CELL} font-medium`}
            />
          ) : (
            <ReadCell>{it.title}</ReadCell>
          )}
        </td>
      ),
      subject: (
        <td key="subject" className="px-1.5 py-1">
          {canEdit ? (
            <SubjectSelect
              value={it.category ?? ""}
              subjects={subjects}
              canAdd={canAddRoster}
              placeholder="—"
              onChange={(v) => void saveRow(it.id, { category: v })}
              className={CELL}
            />
          ) : (
            <ReadCell>{it.category ?? "—"}</ReadCell>
          )}
        </td>
      ),
      day: (
        <td key="day" className="px-1.5 py-1">
          {canEdit ? (
            <OffsetCell value={it.offsetDays} onCommit={(v) => void saveRow(it.id, { offsetDays: v })} />
          ) : (
            <ReadCell>{formatOffset(it.offsetDays)}</ReadCell>
          )}
          <span className="block px-2 text-[10.5px] font-semibold text-slate-400">
            {PHASE_LABELS[phaseFor(it.offsetDays)]}
          </span>
        </td>
      ),
      doer: (
        <td key="doer" className="px-1.5 py-1">
          {canEdit ? (
            <PersonSelect value={it.doerId} people={people} ariaLabel="Doer" onChange={(v) => void saveRow(it.id, { doerId: v })} />
          ) : (
            <ReadCell>{it.doerId ? (nameOf.get(it.doerId) ?? "—") : "—"}</ReadCell>
          )}
        </td>
      ),
      backup: (
        <td key="backup" className="px-1.5 py-1">
          {canEdit ? (
            <PersonSelect
              value={it.backupId}
              people={people}
              exclude={it.doerId}
              ariaLabel="Backup"
              onChange={(v) => void saveRow(it.id, { backupId: v })}
            />
          ) : (
            <ReadCell>{it.backupId ? (nameOf.get(it.backupId) ?? "—") : "—"}</ReadCell>
          )}
        </td>
      ),
      instructions: (
        <td key="instructions" className="px-1.5 py-1">
          {canEdit ? (
            <TextCell
              value={it.instructions}
              ariaLabel="Instructions"
              placeholder="—"
              onCommit={(v) => void saveRow(it.id, { instructions: v })}
              className={CELL}
            />
          ) : (
            <ReadCell>{it.instructions ?? "—"}</ReadCell>
          )}
        </td>
      ),
      fileLink: (
        <td key="fileLink" className="px-1.5 py-1">
          {canEdit ? (
            <TextCell
              value={it.fileLink}
              ariaLabel="File link"
              placeholder="https://…"
              onCommit={(v) => void saveRow(it.id, { fileLink: v })}
              className={CELL}
            />
          ) : it.fileLink ? (
            <a href={it.fileLink} target="_blank" rel="noreferrer" className="block truncate px-2 py-1.5 text-blue-700 underline">
              Open
            </a>
          ) : (
            <ReadCell>—</ReadCell>
          )}
        </td>
      ),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[240px] flex-1">
            {canEdit ? (
              <TextCell
                value={master.name}
                required
                onCommit={(v) => v && void saveMaster({ name: v })}
                ariaLabel="Master name"
                className={`${CELL} text-[18px] font-bold text-slate-900`}
              />
            ) : (
              <h2 className="px-2 text-[18px] font-bold text-slate-900">{master.name}</h2>
            )}
            {canEdit ? (
              <TextCell
                value={master.description}
                onCommit={(v) => void saveMaster({ description: v })}
                placeholder="Add a short description"
                ariaLabel="Master description"
                className={`${CELL} text-slate-600`}
              />
            ) : (
              master.description && <p className="px-2 text-[13px] text-slate-600">{master.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <TypeToggle
                isEvent={master.isEvent}
                disabled={busy}
                onChange={(v) => v !== master.isEvent && void saveMaster({ isEvent: v })}
              />
            ) : (
              <TypeBadge isEvent={master.isEvent} />
            )}
            {canEdit && (
              <>
                <SmallButton onClick={duplicate} disabled={busy}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </SmallButton>
                <SmallButton onClick={retire} disabled={busy}>
                  <Archive className="h-3.5 w-3.5" /> Retire
                </SmallButton>
              </>
            )}
            <Link
              href="/operations/checklist"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Build a checklist <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 px-2">
          <Stat label="Rows" value={String(items.length)} />
          {master.isEvent &&
            PHASE_ORDER.filter((p) => phaseCounts[p] > 0).map((p) => (
              <Stat key={p} label={PHASE_LABELS[p]} value={String(phaseCounts[p])} />
            ))}
          <Stat label="With a doer" value={`${withDoer}/${items.length}`} />
        </div>
      </div>

      {columns.reordered && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12.5px] text-slate-600">
          <span>Columns in your own order — drag a heading by its grip to move it.</span>
          <button
            type="button"
            onClick={columns.reset}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" /> Reset columns
          </button>
        </div>
      )}

      {/* Its own scroll box, both ways, with the headings pinned — the grid's. */}
      <div
        className="table-scroll table-scroll-bold overflow-auto rounded-2xl border border-slate-200 bg-white"
        style={{ maxHeight: "max(420px, calc(100vh - 230px))", overscrollBehaviorY: "auto" }}
      >
        <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed", width: tableWidth }}>
          <colgroup>
            {cols.map((k) => (
              <col key={k} style={{ width: MASTER_WIDTH[k] }} />
            ))}
            {canEdit && <col style={{ width: DELETE_COL }} />}
          </colgroup>
          <thead>
            <tr>
              {cols.map((k) => (
                <th
                  key={k}
                  scope="col"
                  className={STICKY_HEAD}
                  {...drag.headProps(k)}
                  style={{ boxShadow: headShadow(drag.edge(k)), opacity: drag.dragging === k ? 0.45 : 1 }}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap py-3 pl-1.5 pr-3">
                    <ColumnGrip label={MASTER_LABEL[k]} {...drag.gripProps(k)} />
                    {MASTER_LABEL[k]}
                  </span>
                </th>
              ))}
              {canEdit && <th className={STICKY_HEAD} style={{ boxShadow: headShadow(null) }} />}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isShut = collapsed.has(g.key);
              return (
                <React.Fragment key={g.key}>
                  {/* The group's bar: open / shut, "+ Add task" and Bulk upload. */}
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="cursor-pointer p-0"
                      style={{ background: "#FEF2F2" }}
                      onClick={() => toggle(g.key)}
                    >
                      <div className="sticky left-0 flex w-max items-center gap-2 px-3 py-1.5">
                        <button
                          type="button"
                          aria-expanded={!isShut}
                          className="inline-flex h-7 items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: ACCENT_DEEP }}
                        >
                          {isShut ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {g.label}
                          <span className="font-normal normal-case tracking-normal opacity-70">
                            · {g.rows.length} {g.rows.length === 1 ? "task" : "tasks"}
                          </span>
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdding(g.key);
                              }}
                              title={`Add a task${master.isEvent ? ` to ${g.label}` : ""}`}
                              className="ml-2 inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold text-white shadow-sm hover:brightness-110"
                              style={{ background: "linear-gradient(135deg, #B91C1C, #A80400)" }}
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Add task
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBulkFor(g.key);
                              }}
                              title="Add many tasks at once from an Excel sheet"
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-red-50"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" /> Bulk upload
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {!isShut &&
                    g.rows.map((it, i) => {
                      const cells = cellsOf(it, i + 1);
                      return (
                        <tr key={it.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                          {cols.map((k) => cells[k])}
                          {canEdit && (
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                aria-label={`Remove ${it.title}`}
                                disabled={busy}
                                onClick={() => {
                                  if (window.confirm(`Remove “${it.title}” from this master?`)) {
                                    void run(() => removeChecklistItem({ id: it.id }), "Row removed.");
                                  }
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}

                  {!isShut && g.rows.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} className="px-3 py-3 text-slate-400">
                        <span className="sticky left-3">
                          Nothing here yet.{canEdit ? " Use + Add task or Bulk upload on the bar above." : ""}
                        </span>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <>
          <ChecklistTaskDialog
            open={adding !== null}
            onOpenChange={(o) => !o && setAdding(null)}
            target="master"
            isEvent={master.isEvent}
            defaultOffset={phaseOffset(adding, master.isEvent)}
            groupLabel={groupLabel(adding)}
            containerName={master.name}
            people={people}
            subjects={subjects}
            canAddRoster={canAddRoster}
            onAdd={async (v) => {
              const res = await createTemplateItem({ templateId: master.id, ...v });
              if (!res.ok) return res;
              if (adding) setCollapsed((prev) => (prev.has(adding) ? new Set([...prev].filter((p) => p !== adding)) : prev));
              router.refresh();
              return { ok: true };
            }}
          />
          <ChecklistBulkUpload
            open={bulkFor !== null}
            onOpenChange={(o) => !o && setBulkFor(null)}
            target="master"
            ownerId={master.id}
            containerName={master.name}
            isEvent={master.isEvent}
            defaultOffset={phaseOffset(bulkFor, master.isEvent)}
            groupLabel={groupLabel(bulkFor)}
            people={people}
            subjects={subjects}
          />
        </>
      )}
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function TextCell({
  value,
  onCommit,
  placeholder,
  className,
  ariaLabel,
  required = false,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  required?: boolean;
}) {
  const current = value ?? "";
  const [draft, setDraft] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  // A saved value that changed on the server replaces the draft.
  if (seen !== current) {
    setSeen(current);
    setDraft(current);
  }

  return (
    <input
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(current);
      }}
      onBlur={() => {
        const v = draft.trim();
        if (v === current.trim()) return;
        if (required && !v) {
          setDraft(current);
          return;
        }
        onCommit(v || null);
      }}
      className={className}
    />
  );
}

function OffsetCell({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const current = value === null ? "" : formatOffset(value);
  const [draft, setDraft] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    setDraft(current);
  }

  return (
    <input
      value={draft}
      aria-label="Day relative to the event"
      placeholder="e.g. -3"
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onBlur={() => {
        const raw = draft.trim();
        if (raw === current) return;
        const n = parseOffset(raw);
        if (raw !== "" && n === null) {
          fireToast({ message: `Day must be a whole number from ${OFFSET_MIN} to ${OFFSET_MAX}.`, type: "error" });
          setDraft(current);
          return;
        }
        if (n === value) {
          setDraft(current);
          return;
        }
        onCommit(n);
      }}
      className={`${CELL} tabular-nums`}
    />
  );
}

function PersonSelect({
  value,
  people,
  onChange,
  exclude = null,
  ariaLabel,
}: {
  value: string | null;
  people: ChecklistPersonRow[];
  onChange: (v: string | null) => void;
  exclude?: string | null;
  ariaLabel: string;
}) {
  return (
    <select
      value={value ?? ""}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value || null)}
      className={CELL}
    >
      <option value="">—</option>
      {people
        .filter((p) => p.id !== exclude || p.id === value)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}

function ReadCell({ children }: { children: React.ReactNode }) {
  return <span className="block px-2 py-1.5 text-slate-700">{children}</span>;
}

function SmallButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-600">
      {label} <b className="font-bold tabular-nums text-slate-800">{value}</b>
    </span>
  );
}
