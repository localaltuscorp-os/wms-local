"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Check,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import { fireToast } from "@/lib/toast";
import type {
  AccountsTaskRow,
  AccountsScreenshotRow,
} from "@/lib/queries/accounts";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import {
  createTask,
  updateTask,
  deleteTask,
  quickPatchTask,
  createShot,
  updateShot,
  deleteShot,
} from "@/app/(app)/accounts/task-list/actions";

// ── Shared bits ──────────────────────────────────────────────────────────────

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CHIP =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${MONTHS[mi] ?? m} ${y}`;
}

/** Status → chip palette. Pending=amber, Done=green, Need Help=red, else neutral. */
function statusTone(status: string): { bg: string; fg: string; dot: string } {
  const s = status.trim().toLowerCase();
  if (s === "done")
    return {
      bg: "color-mix(in srgb, var(--color-green) 14%, transparent)",
      fg: "var(--color-green-deep)",
      dot: "var(--color-green)",
    };
  if (s === "need help" || s === "need info")
    return {
      bg: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
      fg: "var(--color-altus-red-deep)",
      dot: "var(--color-altus-red)",
    };
  if (s === "pending")
    return {
      bg: "color-mix(in srgb, var(--color-amber, #f59e0b) 18%, transparent)",
      fg: "var(--color-amber-deep, #b45309)",
      dot: "var(--color-amber, #f59e0b)",
    };
  return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-soft)", dot: "var(--color-ink-subtle)" };
}

function GearChip({ value }: { value: string | null }) {
  if (!value) return <Dim />;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap"
      style={{ background: "var(--color-surface-track, #eef2f7)", color: "var(--color-ink-soft)" }}
    >
      {value}
    </span>
  );
}

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}

/** Inline, colored Status dropdown — change status straight from the table. */
function InlineStatusSelect({ value, options, onChange, busy }: { value: string; options: string[]; onChange: (v: string) => void; busy: boolean }) {
  const t = statusTone(value);
  const opts = Array.from(new Set([...options, value].filter(Boolean)));
  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Status"
      className="cursor-pointer appearance-none rounded-full px-2.5 py-1 text-[12.5px] font-bold outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{ background: t.bg, color: t.fg, border: "1px solid transparent", minWidth: 116 }}
    >
      {opts.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  );
}

/** Inline Gear dropdown. */
function InlineGearSelect({ value, options, onChange, busy }: { value: string | null; options: string[]; onChange: (v: string) => void; busy: boolean }) {
  const opts = Array.from(new Set([...options, value ?? ""].filter(Boolean)));
  return (
    <select
      value={value ?? ""}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Gear"
      className="cursor-pointer appearance-none rounded-full px-2.5 py-1 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{ background: value ? "var(--color-surface-track, #eef2f7)" : "transparent", border: value ? "1px solid transparent" : "1px solid var(--color-hairline)", minWidth: 108 }}
    >
      <option value="">—</option>
      {opts.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  );
}

function Links({ value }: { value: string | null }) {
  if (!value) return <Dim />;
  const isUrl = /^https?:\/\//i.test(value.trim());
  if (isUrl) {
    return (
      <a
        href={value.trim()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-[220px] items-center gap-1.5 truncate font-semibold text-altus-red hover:underline"
        title={value}
      >
        <ExternalLink size={13} strokeWidth={2.4} className="shrink-0" />
        <span className="truncate">{value.replace(/^https?:\/\//i, "")}</span>
      </a>
    );
  }
  return (
    <span className="block max-w-[220px] truncate" title={value}>
      {value}
    </span>
  );
}

function lookupAdd(kind: string) {
  return async (name: string) => {
    const res = await addAccountsLookup(kind, name);
    return res.ok
      ? ({ ok: true as const, option: { id: res.option.id, name: res.option.name } })
      : ({ ok: false as const, error: res.error });
  };
}
function lookupDelete() {
  return async (id: string) => {
    const res = await softDeleteAccountsLookup(id);
    return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error });
  };
}

/** LookupSelect works on option ids; our rows store the display value. Map both ways. */
function ValueSelect({
  label,
  kind,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  kind: string;
  options: LookupOption[];
  value: string | null;
  onChange: (name: string | null) => void;
  placeholder?: string;
}) {
  // Keep a live copy so freshly-added options (added via the inline "+") resolve
  // back to a display name before the next server revalidation. Mirrors the same
  // prop→state sync LookupSelect itself uses for its seed.
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => {
    setOpts((prev) => {
      const extra = prev.filter((p) => !options.some((o) => o.id === p.id));
      return [...options, ...extra];
    });
  }, [options]);

  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;

  return (
    <LookupSelect
      label={label}
      value={selectedId}
      options={opts}
      placeholder={placeholder}
      className={INPUT}
      onChange={(id) => {
        const name = id ? (opts.find((o) => o.id === id)?.name ?? null) : null;
        onChange(name);
      }}
      onAdd={async (name) => {
        const res = await lookupAdd(kind)(name);
        if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option]));
        return res;
      }}
      onDelete={lookupDelete()}
    />
  );
}

type SortDir = "asc" | "desc";

function Th({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey?: string;
  sort?: { key: string; dir: SortDir };
  onSort?: (k: string) => void;
  className?: string;
}) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th
      className={
        "px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " +
        (className ?? "")
      }
      style={{ background: "var(--color-surface-soft)" }}
    >
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 hover:text-ink-strong">
          {label}
          {active ? (
            sort!.dir === "asc" ? <ArrowUp size={13} strokeWidth={2.6} /> : <ArrowDown size={13} strokeWidth={2.6} />
          ) : (
            <ArrowUpDown size={13} strokeWidth={2} style={{ opacity: 0.5 }} />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-4 py-3 align-top text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}

function RowActions({
  onEdit,
  onDelete,
  busy,
}: {
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        aria-label="Edit row"
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"
      >
        <Pencil size={15} strokeWidth={2.2} />
      </button>
      {confirming ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />}
          Confirm
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          aria-label="Delete row"
          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"
        >
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN TABLE — Accounts Task List
// ════════════════════════════════════════════════════════════════════════════

type TaskDraft = {
  srNo: string;
  area: string;
  taskDescription: string;
  status: string | null;
  links: string;
  targetDate: string;
  actualDate: string;
  gear: string | null;
  notes: string;
};

function emptyTaskDraft(defaultStatus: string): TaskDraft {
  return {
    srNo: "",
    area: "",
    taskDescription: "",
    status: defaultStatus,
    links: "",
    targetDate: "",
    actualDate: "",
    gear: null,
    notes: "",
  };
}
function taskToDraft(r: AccountsTaskRow): TaskDraft {
  return {
    srNo: r.srNo?.toString() ?? "",
    area: r.area ?? "",
    taskDescription: r.taskDescription ?? "",
    status: r.status,
    links: r.links ?? "",
    targetDate: r.targetDate ?? "",
    actualDate: r.actualDate ?? "",
    gear: r.gear,
    notes: r.notes ?? "",
  };
}

const TASK_COLS = 10;

export function TaskListTable({
  rows: rowsProp,
  statusOptions,
  gearOptions,
}: {
  rows: AccountsTaskRow[];
  statusOptions: LookupOption[];
  gearOptions: LookupOption[];
}) {
  // Local copy so inline status/gear changes apply optimistically.
  const [rows, setRows] = React.useState(rowsProp);
  React.useEffect(() => setRows(rowsProp), [rowsProp]);

  const [q, setQ] = React.useState("");
  const [fStatus, setFStatus] = React.useState("");
  const [fGear, setFGear] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: SortDir }>({ key: "srNo", dir: "asc" });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<TaskDraft>(() =>
    emptyTaskDraft(statusOptions[0]?.name ?? "Pending"),
  );
  const [busy, setBusy] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [cellBusy, setCellBusy] = React.useState<string | null>(null);

  /** Optimistic inline patch of status/gear from the table. */
  function patchRow(id: string, patch: { status?: string; gear?: string }) {
    const prev = rows.find((r) => r.id === id);
    if (!prev) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setCellBusy(id);
    startTransition(async () => {
      const res = await quickPatchTask({ id, ...patch });
      setCellBusy(null);
      if (!res.ok) {
        setRows((rs) => rs.map((r) => (r.id === id ? prev : r)));
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const statusValues = React.useMemo(
    () => Array.from(new Set([...statusOptions.map((o) => o.name), ...rows.map((r) => r.status)].filter(Boolean))),
    [statusOptions, rows],
  );
  const gearValues = React.useMemo(
    () =>
      Array.from(
        new Set([...gearOptions.map((o) => o.name), ...rows.map((r) => r.gear ?? "")].filter(Boolean)),
      ),
    [gearOptions, rows],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (fStatus && r.status !== fStatus) return false;
      if (fGear && (r.gear ?? "") !== fGear) return false;
      const d = r.targetDate ?? "";
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      if (needle) {
        const hay = [r.area, r.taskDescription, r.links, r.notes, r.status, r.gear]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const k = sort.key;
    out = [...out].sort((a, b) => {
      if (k === "srNo") return ((a.srNo ?? 0) - (b.srNo ?? 0)) * dir;
      const av = String((a as unknown as Record<string, unknown>)[k] ?? "");
      const bv = String((b as unknown as Record<string, unknown>)[k] ?? "");
      return av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true }) * dir;
    });
    return out;
  }, [rows, q, fStatus, fGear, from, to, sort]);

  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const hasFilters = q || fStatus || fGear || from || to;
  function clearFilters() {
    setQ("");
    setFStatus("");
    setFGear("");
    setFrom("");
    setTo("");
  }

  function startAdd() {
    setEditingId(null);
    setDraft(emptyTaskDraft(statusOptions[0]?.name ?? "Pending"));
    setAdding(true);
  }
  function startEdit(r: AccountsTaskRow) {
    setAdding(false);
    setDraft(taskToDraft(r));
    setEditingId(r.id);
  }
  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  function save() {
    const status = (draft.status ?? "").trim();
    if (!status) {
      fireToast({ message: "Status is required.", type: "error" });
      return;
    }
    setBusy(true);
    const payload = {
      srNo: draft.srNo,
      area: draft.area,
      taskDescription: draft.taskDescription,
      status,
      links: draft.links,
      targetDate: draft.targetDate,
      actualDate: draft.actualDate,
      gear: draft.gear,
      notes: draft.notes,
    };
    startTransition(async () => {
      const res = adding
        ? await createTask(payload)
        : await updateTask({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: adding ? "Task added." : "Task saved.", type: "success" });
      cancel();
    });
  }

  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteTask(id);
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Task removed.", type: "info" });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — area, description, links, notes" title="Local search — filters only the list on this page" aria-label="Local search — area, description, links, notes — this page only"
            className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
        </div>
        <select className={CHIP} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All Statuses</option>
          {statusValues.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className={CHIP} value={fGear} onChange={(e) => setFGear(e.target.value)} aria-label="Filter by gear">
          <option value="">All Gear</option>
          {gearValues.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <input type="date" className={CHIP} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Target date from" title="Target date — from" />
        <input type="date" className={CHIP} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Target date to" title="Target date — to" />
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
        <button
          type="button"
          onClick={startAdd}
          className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)",
          }}
        >
          <Plus size={16} strokeWidth={2.6} /> Add Task
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "task" : "tasks"}
        {hasFilters ? ` · filtered from ${rows.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1280 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th label="Sr. No" sortKey="srNo" sort={sort} onSort={toggleSort} />
              <Th label="Area" sortKey="area" sort={sort} onSort={toggleSort} />
              <Th label="Task description" sortKey="taskDescription" sort={sort} onSort={toggleSort} />
              <Th label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
              <Th label="Links" />
              <Th label="Target date" sortKey="targetDate" sort={sort} onSort={toggleSort} />
              <Th label="Actual date" sortKey="actualDate" sort={sort} onSort={toggleSort} />
              <Th label="Gear" sortKey="gear" sort={sort} onSort={toggleSort} />
              <Th label="Notes" />
              <Th label="" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {adding && (
              <TaskEditRow
                draft={draft}
                setDraft={setDraft}
                statusOptions={statusOptions}
                gearOptions={gearOptions}
                onSave={save}
                onCancel={cancel}
                busy={busy || pending}
              />
            )}
            {filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={TASK_COLS} className="px-5 py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">
                    {hasFilters ? "No tasks match these filters." : "No tasks yet."}
                  </p>
                  {!hasFilters && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First Task
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) =>
                editingId === r.id ? (
                  <TaskEditRow
                    key={r.id}
                    draft={draft}
                    setDraft={setDraft}
                    statusOptions={statusOptions}
                    gearOptions={gearOptions}
                    onSave={save}
                    onCancel={cancel}
                    busy={busy || pending}
                  />
                ) : (
                  <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td className="font-semibold text-ink-strong">{r.srNo ?? <Dim />}</Td>
                    <Td>{r.area ? <span className="font-semibold text-ink-strong">{r.area}</span> : <Dim />}</Td>
                    <Td>
                      {r.taskDescription ? (
                        <span className="block max-w-[420px] whitespace-pre-wrap break-words text-ink-soft">{r.taskDescription}</span>
                      ) : (
                        <Dim />
                      )}
                    </Td>
                    <Td><InlineStatusSelect value={r.status} options={statusValues} onChange={(v) => patchRow(r.id, { status: v })} busy={cellBusy === r.id} /></Td>
                    <Td><Links value={r.links} /></Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.targetDate)}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.actualDate)}</Td>
                    <Td><InlineGearSelect value={r.gear} options={gearValues} onChange={(v) => patchRow(r.id, { gear: v })} busy={cellBusy === r.id} /></Td>
                    <Td>
                      {r.notes ? (
                        <span className="block max-w-[260px] truncate" title={r.notes}>{r.notes}</span>
                      ) : (
                        <Dim />
                      )}
                    </Td>
                    <Td className="text-right">
                      <RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy || pending} />
                    </Td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TaskEditRow({
  draft,
  setDraft,
  statusOptions,
  gearOptions,
  onSave,
  onCancel,
  busy,
}: {
  draft: TaskDraft;
  setDraft: React.Dispatch<React.SetStateAction<TaskDraft>>;
  statusOptions: LookupOption[];
  gearOptions: LookupOption[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <Td>
        <input
          type="number"
          value={draft.srNo}
          onChange={(e) => setDraft((d) => ({ ...d, srNo: e.target.value }))}
          className={INPUT}
          style={{ width: 84 }}
          placeholder="#"
          aria-label="Sr. No"
        />
      </Td>
      <Td>
        <input value={draft.area} onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))} className={INPUT} style={{ minWidth: 140 }} placeholder="Area" aria-label="Area" autoFocus />
      </Td>
      <Td>
        <textarea
          value={draft.taskDescription}
          onChange={(e) => setDraft((d) => ({ ...d, taskDescription: e.target.value }))}
          className={INPUT + " min-h-[64px] resize-y"}
          style={{ minWidth: 320 }}
          placeholder="Task description"
          aria-label="Task description"
        />
      </Td>
      <Td>
        <div style={{ minWidth: 170 }}>
          <ValueSelect label="status" kind="task_status" options={statusOptions} value={draft.status} onChange={(v) => setDraft((d) => ({ ...d, status: v }))} placeholder="Status…" />
        </div>
      </Td>
      <Td>
        <input value={draft.links} onChange={(e) => setDraft((d) => ({ ...d, links: e.target.value }))} className={INPUT} style={{ minWidth: 180 }} placeholder="https://…" aria-label="Links" />
      </Td>
      <Td>
        <input type="date" value={draft.targetDate} onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))} className={INPUT} aria-label="Target date" />
      </Td>
      <Td>
        <input type="date" value={draft.actualDate} onChange={(e) => setDraft((d) => ({ ...d, actualDate: e.target.value }))} className={INPUT} aria-label="Actual date" />
      </Td>
      <Td>
        <div style={{ minWidth: 160 }}>
          <ValueSelect label="gear" kind="task_gear" options={gearOptions} value={draft.gear} onChange={(v) => setDraft((d) => ({ ...d, gear: v }))} placeholder="Gear…" />
        </div>
      </Td>
      <Td>
        <div className="flex flex-col gap-1.5" style={{ minWidth: 220 }}>
          <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT + " min-h-[64px] resize-y"} placeholder="Notes — type or use the mic" aria-label="Notes" />
          <VoiceNoteButton
            label="Voice note → transcript"
            onText={(text) => setDraft((d) => ({ ...d, notes: d.notes.trim() ? d.notes.trim() + "\n" + text : text }))}
            className="self-start"
          />
        </div>
      </Td>
      <Td className="text-right">
        <SaveCancel onSave={onSave} onCancel={onCancel} busy={busy} />
      </Td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SUB-TABLE — Screenshots to Post
// ════════════════════════════════════════════════════════════════════════════

type ShotDraft = {
  srNo: string;
  projectName: string;
  projectDetails: string;
  frequency: string | null;
  targetDate: string;
  actualDate: string;
  gear: string | null;
  notes: string;
};

function emptyShotDraft(): ShotDraft {
  return { srNo: "", projectName: "", projectDetails: "", frequency: null, targetDate: "", actualDate: "", gear: null, notes: "" };
}
function shotToDraft(r: AccountsScreenshotRow): ShotDraft {
  return {
    srNo: r.srNo?.toString() ?? "",
    projectName: r.projectName ?? "",
    projectDetails: r.projectDetails ?? "",
    frequency: r.frequency,
    targetDate: r.targetDate ?? "",
    actualDate: r.actualDate ?? "",
    gear: r.gear,
    notes: r.notes ?? "",
  };
}

const SHOT_COLS = 9;

export function ScreenshotsTable({
  rows,
  freqOptions,
  gearOptions,
}: {
  rows: AccountsScreenshotRow[];
  freqOptions: LookupOption[];
  gearOptions: LookupOption[];
}) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: SortDir }>({ key: "srNo", dir: "asc" });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<ShotDraft>(emptyShotDraft);
  const [busy, setBusy] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (!needle) return true;
      const hay = [r.projectName, r.projectDetails, r.frequency, r.notes, r.gear].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const k = sort.key;
    out = [...out].sort((a, b) => {
      if (k === "srNo") return ((a.srNo ?? 0) - (b.srNo ?? 0)) * dir;
      const av = String((a as unknown as Record<string, unknown>)[k] ?? "");
      const bv = String((b as unknown as Record<string, unknown>)[k] ?? "");
      return av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true }) * dir;
    });
    return out;
  }, [rows, q, sort]);

  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function startAdd() {
    setEditingId(null);
    setDraft(emptyShotDraft());
    setAdding(true);
  }
  function startEdit(r: AccountsScreenshotRow) {
    setAdding(false);
    setDraft(shotToDraft(r));
    setEditingId(r.id);
  }
  function cancel() {
    setAdding(false);
    setEditingId(null);
  }
  function save() {
    setBusy(true);
    const payload = {
      srNo: draft.srNo,
      projectName: draft.projectName,
      projectDetails: draft.projectDetails,
      frequency: draft.frequency,
      targetDate: draft.targetDate,
      actualDate: draft.actualDate,
      gear: draft.gear,
      notes: draft.notes,
    };
    startTransition(async () => {
      const res = adding ? await createShot(payload) : await updateShot({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: adding ? "Screenshot added." : "Screenshot saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteShot(id);
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Screenshot removed.", type: "info" });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — project, details, notes" title="Local search — filters only the list on this page" aria-label="Local search — project, details, notes — this page only"
            className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
        </div>
        <button
          type="button"
          onClick={startAdd}
          className="ml-auto inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2.5 px-4 text-[14.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)]"
        >
          <Plus size={16} strokeWidth={2.6} /> Add Screenshot
        </button>
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1180 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th label="Sr. No" sortKey="srNo" sort={sort} onSort={toggleSort} />
              <Th label="Project name" sortKey="projectName" sort={sort} onSort={toggleSort} />
              <Th label="Project details" />
              <Th label="Frequency" sortKey="frequency" sort={sort} onSort={toggleSort} />
              <Th label="Target date" sortKey="targetDate" sort={sort} onSort={toggleSort} />
              <Th label="Actual date" sortKey="actualDate" sort={sort} onSort={toggleSort} />
              <Th label="Gear" sortKey="gear" sort={sort} onSort={toggleSort} />
              <Th label="Notes" />
              <Th label="" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {adding && (
              <ShotEditRow
                draft={draft}
                setDraft={setDraft}
                freqOptions={freqOptions}
                gearOptions={gearOptions}
                onSave={save}
                onCancel={cancel}
                busy={busy || pending}
              />
            )}
            {filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={SHOT_COLS} className="px-5 py-12 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">{q ? "No screenshots match." : "No screenshots to post yet."}</p>
                  {!q && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First One
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) =>
                editingId === r.id ? (
                  <ShotEditRow
                    key={r.id}
                    draft={draft}
                    setDraft={setDraft}
                    freqOptions={freqOptions}
                    gearOptions={gearOptions}
                    onSave={save}
                    onCancel={cancel}
                    busy={busy || pending}
                  />
                ) : (
                  <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td className="font-semibold text-ink-strong">{r.srNo ?? <Dim />}</Td>
                    <Td>{r.projectName ? <span className="font-semibold text-ink-strong">{r.projectName}</span> : <Dim />}</Td>
                    <Td>
                      {r.projectDetails ? (
                        <span className="block max-w-[360px] whitespace-pre-wrap break-words text-ink-soft">{r.projectDetails}</span>
                      ) : (
                        <Dim />
                      )}
                    </Td>
                    <Td>{r.frequency ? <GearChip value={r.frequency} /> : <Dim />}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.targetDate)}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.actualDate)}</Td>
                    <Td><GearChip value={r.gear} /></Td>
                    <Td>
                      {r.notes ? <span className="block max-w-[240px] truncate" title={r.notes}>{r.notes}</span> : <Dim />}
                    </Td>
                    <Td className="text-right">
                      <RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy || pending} />
                    </Td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ShotEditRow({
  draft,
  setDraft,
  freqOptions,
  gearOptions,
  onSave,
  onCancel,
  busy,
}: {
  draft: ShotDraft;
  setDraft: React.Dispatch<React.SetStateAction<ShotDraft>>;
  freqOptions: LookupOption[];
  gearOptions: LookupOption[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <Td>
        <input type="number" value={draft.srNo} onChange={(e) => setDraft((d) => ({ ...d, srNo: e.target.value }))} className={INPUT} style={{ width: 84 }} placeholder="#" aria-label="Sr. No" />
      </Td>
      <Td>
        <input value={draft.projectName} onChange={(e) => setDraft((d) => ({ ...d, projectName: e.target.value }))} className={INPUT} style={{ minWidth: 160 }} placeholder="Project name" aria-label="Project name" autoFocus />
      </Td>
      <Td>
        <textarea value={draft.projectDetails} onChange={(e) => setDraft((d) => ({ ...d, projectDetails: e.target.value }))} className={INPUT + " min-h-[64px] resize-y"} style={{ minWidth: 280 }} placeholder="Project details" aria-label="Project details" />
      </Td>
      <Td>
        <div style={{ minWidth: 160 }}>
          <ValueSelect label="frequency" kind="shot_freq" options={freqOptions} value={draft.frequency} onChange={(v) => setDraft((d) => ({ ...d, frequency: v }))} placeholder="Frequency…" />
        </div>
      </Td>
      <Td>
        <input type="date" value={draft.targetDate} onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))} className={INPUT} aria-label="Target date" />
      </Td>
      <Td>
        <input type="date" value={draft.actualDate} onChange={(e) => setDraft((d) => ({ ...d, actualDate: e.target.value }))} className={INPUT} aria-label="Actual date" />
      </Td>
      <Td>
        <div style={{ minWidth: 160 }}>
          <ValueSelect label="gear" kind="shot_gear" options={gearOptions} value={draft.gear} onChange={(v) => setDraft((d) => ({ ...d, gear: v }))} placeholder="Gear…" />
        </div>
      </Td>
      <Td>
        <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT + " min-h-[64px] resize-y"} style={{ minWidth: 200 }} placeholder="Notes" aria-label="Notes" />
      </Td>
      <Td className="text-right">
        <SaveCancel onSave={onSave} onCancel={onCancel} busy={busy} />
      </Td>
    </tr>
  );
}

function SaveCancel({ onSave, onCancel, busy }: { onSave: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        aria-label="Save row"
        className="inline-flex size-9 items-center justify-center rounded-lg text-white disabled:opacity-50"
        style={{ background: "var(--color-altus-red)" }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} strokeWidth={2.6} />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        aria-label="Cancel"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-muted hover:bg-surface-soft disabled:opacity-50"
      >
        <X size={17} strokeWidth={2.6} />
      </button>
    </div>
  );
}
