"use client";

import * as React from "react";
import {
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
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { MonthlyItemRow, MonthlyCheckCell } from "@/lib/queries/accounts-monthly";
import {
  MONTHLY_CHECK_STATUSES,
  monthlyStatusTone,
  monthlyCheckKey,
  expectedMonths,
  MONTH_SHORT,
  type FyMonthCol,
} from "@/lib/accounts/monthly";
import {
  createMonthlyItem,
  updateMonthlyItem,
  deleteMonthlyItem,
  setMonthlyCheck,
} from "@/app/(app)/accounts/monthly-quarterly-annual/actions";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CHIP =
  "rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

// ── Managed dropdown plumbing (mirrors the Weekly Checklist) ──────────────────

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

/** LookupSelect works on option ids; rows store the display value — map both ways. */
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
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => {
        const res = await lookupAdd(kind)(name);
        if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option]));
        return res;
      }}
      onDelete={lookupDelete()}
    />
  );
}

// ── Small display bits ────────────────────────────────────────────────────────

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}

function MetaChip({ value, tone }: { value: string | null; tone?: "deadline" | "type" }) {
  if (!value) return <Dim />;
  const palette =
    tone === "deadline"
      ? { bg: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", fg: "var(--color-altus-red-deep)" }
      : { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-soft)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {value}
    </span>
  );
}

// ── A single editable month-status cell ───────────────────────────────────────

function MonthCell({
  status,
  busy,
  onChange,
  isCurrent,
  expected,
}: {
  status: string;
  busy: boolean;
  onChange: (next: string) => void;
  isCurrent: boolean;
  expected: boolean;
}) {
  const tone = monthlyStatusTone(status);
  // Non-expected, still-empty cells recede (intentional blank, not a miss).
  const recede = !expected && !status;
  return (
    <select
      value={status}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Month status"
      className="w-full cursor-pointer appearance-none rounded-md px-1 py-1 text-center text-[11px] font-bold outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{
        background: tone.bg,
        color: tone.fg,
        opacity: recede ? 0.4 : 1,
        border: isCurrent
          ? "1.5px solid var(--color-altus-red)"
          : `1px solid ${status ? "transparent" : recede ? "transparent" : "var(--color-hairline)"}`,
        // 78 → 62: twelve of these set the table's whole minimum width, so this
        // is what actually buys back horizontal room.
        minWidth: 62,
      }}
    >
      <option value="">{expected ? "—" : "·"}</option>
      {MONTHLY_CHECK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s === "Not Applicable" ? "N/A" : s}
        </option>
      ))}
    </select>
  );
}

// ── Item draft ────────────────────────────────────────────────────────────────

type Draft = {
  code: string;
  title: string;
  responsiblePerson: string | null;
  deadline: string | null;
  type: string | null;
  frequency: string | null;
  dueMonth: number | null;
  accountsNotes: string;
  mananNotes: string;
  fileLink: string;
};

function emptyDraft(): Draft {
  return {
    code: "",
    title: "",
    responsiblePerson: null,
    deadline: null,
    type: null,
    frequency: null,
    dueMonth: null,
    accountsNotes: "",
    mananNotes: "",
    fileLink: "",
  };
}
function toDraft(r: MonthlyItemRow): Draft {
  return {
    code: r.code ?? "",
    title: r.title,
    responsiblePerson: r.responsiblePerson,
    deadline: r.deadline,
    type: r.type,
    frequency: r.frequency,
    dueMonth: r.dueMonth,
    accountsNotes: r.accountsNotes ?? "",
    mananNotes: r.mananNotes ?? "",
    fileLink: r.fileLink ?? "",
  };
}

// ════════════════════════════════════════════════════════════════════════════

export function MonthlyChecklist({
  fyStartYear,
  cols,
  currentMonth,
  items,
  checks,
  typeOptions,
  responsibleOptions,
  deadlineOptions,
  frequencyOptions,
}: {
  fyStartYear: number;
  cols: FyMonthCol[];
  currentMonth: number | null;
  items: MonthlyItemRow[];
  checks: MonthlyCheckCell[];
  typeOptions: LookupOption[];
  responsibleOptions: LookupOption[];
  deadlineOptions: LookupOption[];
  frequencyOptions: LookupOption[];
}) {
  // Live, optimistic copy of the check grid (key = itemId:month).
  const [grid, setGrid] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of checks) m[monthlyCheckKey(c.itemId, c.month)] = c.status;
    return m;
  });
  React.useEffect(() => {
    const m: Record<string, string> = {};
    for (const c of checks) m[monthlyCheckKey(c.itemId, c.month)] = c.status;
    setGrid(m);
  }, [checks]);

  const [q, setQ] = React.useState("");
  const [fType, setFType] = React.useState("");
  const [fResponsible, setFResponsible] = React.useState("");
  const [fFrequency, setFFrequency] = React.useState("");

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [cellBusy, setCellBusy] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const types = React.useMemo(
    () => Array.from(new Set([...typeOptions.map((o) => o.name), ...items.map((i) => i.type ?? "")].filter(Boolean))),
    [typeOptions, items],
  );
  const responsibles = React.useMemo(
    () => Array.from(new Set([...responsibleOptions.map((o) => o.name), ...items.map((i) => i.responsiblePerson ?? "")].filter(Boolean))),
    [responsibleOptions, items],
  );
  const frequencies = React.useMemo(
    () => Array.from(new Set([...frequencyOptions.map((o) => o.name), ...items.map((i) => i.frequency ?? "")].filter(Boolean))),
    [frequencyOptions, items],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (fType && (r.type ?? "") !== fType) return false;
      if (fResponsible && (r.responsiblePerson ?? "") !== fResponsible) return false;
      if (fFrequency && (r.frequency ?? "") !== fFrequency) return false;
      if (needle) {
        const hay = [r.code, r.title, r.type, r.deadline, r.responsiblePerson, r.frequency, r.accountsNotes, r.mananNotes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, fType, fResponsible, fFrequency]);

  // Per-month done count (across all items, this FY).
  const doneByMonth = React.useMemo(() => {
    const counts: Record<number, number> = {};
    for (const c of cols) counts[c.month] = 0;
    for (const c of checks) {
      if (c.status === "Done" && counts[c.month] !== undefined) {
        counts[c.month] = (counts[c.month] ?? 0) + 1;
      }
    }
    return counts;
  }, [checks, cols]);

  const hasFilters = q || fType || fResponsible || fFrequency;
  function clearFilters() {
    setQ("");
    setFType("");
    setFResponsible("");
    setFFrequency("");
  }

  function startAdd() {
    setEditingId(null);
    setDraft(emptyDraft());
    setAdding(true);
  }
  function startEdit(r: MonthlyItemRow) {
    setAdding(false);
    setDraft(toDraft(r));
    setEditingId(r.id);
  }
  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  function save() {
    const title = draft.title.trim();
    if (!title) {
      fireToast({ message: "A checklist title is required.", type: "error" });
      return;
    }
    setBusy(true);
    const payload = {
      code: draft.code,
      title,
      responsiblePerson: draft.responsiblePerson,
      deadline: draft.deadline,
      type: draft.type,
      frequency: draft.frequency,
      dueMonth: draft.dueMonth,
      accountsNotes: draft.accountsNotes,
      mananNotes: draft.mananNotes,
      fileLink: draft.fileLink,
    };
    startTransition(async () => {
      const res = adding
        ? await createMonthlyItem(payload)
        : await updateMonthlyItem({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: adding ? "Item added." : "Item saved.", type: "success" });
      cancel();
    });
  }

  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteMonthlyItem(id);
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Item removed.", type: "info" });
    });
  }

  function changeCell(itemId: string, month: number, next: string) {
    const key = monthlyCheckKey(itemId, month);
    const prev = grid[key] ?? "";
    setGrid((g) => {
      const n = { ...g };
      if (next) n[key] = next;
      else delete n[key];
      return n;
    });
    setCellBusy(key);
    startTransition(async () => {
      const res = await setMonthlyCheck({ itemId, fyStartYear, month, status: next });
      setCellBusy(null);
      if (!res.ok) {
        // Revert on failure.
        setGrid((g) => {
          const n = { ...g };
          if (prev) n[key] = prev;
          else delete n[key];
          return n;
        });
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const META_COLS = 6; // code, title, responsible, deadline, type, freq
  const totalCols = META_COLS + cols.length + 2; // + month cols + notes + actions

  return (
    <section className="flex flex-col gap-2.5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-2.5">
          <Search size={15} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — checklist, notes, responsible" title="Local search — filters only the list on this page" aria-label="Local search — checklist, notes, responsible — this page only"
            className="w-full bg-transparent py-1.5 text-[13px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
        </div>
        <select className={CHIP} value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Filter by type">
          <option value="">All Types</option>
          {types.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select className={CHIP} value={fFrequency} onChange={(e) => setFFrequency(e.target.value)} aria-label="Filter by frequency">
          <option value="">All Frequencies</option>
          {frequencies.map((f) => (<option key={f} value={f}>{f}</option>))}
        </select>
        <select className={CHIP} value={fResponsible} onChange={(e) => setFResponsible(e.target.value)} aria-label="Filter by responsible">
          <option value="">All People</option>
          {responsibles.map((p) => (<option key={p} value={p}>{p}</option>))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={14} strokeWidth={2.4} /> Clear
          </button>
        )}
        <button
          type="button"
          onClick={startAdd}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        >
          <Plus size={14} strokeWidth={2.6} /> Add Item
        </button>
      </div>

      <div className="text-[12px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "item" : "items"}
        {hasFilters ? ` · filtered from ${items.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        {/* Per-month track down from 92 to 70 with the narrower cells above. */}
        <table className="w-full border-collapse text-left" style={{ minWidth: 860 + cols.length * 70 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>S. No</Th>
              <Th>Things to get done</Th>
              <Th>Responsible</Th>
              <Th>Deadline</Th>
              <Th>Type</Th>
              <Th>Freq</Th>
              {cols.map((c) => (
                <th
                  key={c.month}
                  className="px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.04em] text-ink-subtle whitespace-nowrap"
                  style={{
                    background: c.month === currentMonth
                      ? "color-mix(in srgb, var(--color-altus-red) 9%, var(--color-surface-soft))"
                      : "var(--color-surface-soft)",
                  }}
                >
                  {/* Three stacked lines (month / 'yy / done-count) made the
                      header three rows tall. Month and year read as one token,
                      and the count sits under it. */}
                  <div className="text-ink-strong">
                    {c.label}
                    <span className="ml-0.5 font-semibold normal-case tracking-normal text-ink-subtle">
                      &apos;{String(c.calYear % 100).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="text-[9.5px] font-bold" style={{ color: "var(--color-green-deep)" }}>
                    {doneByMonth[c.month] ?? 0}/{items.length}
                  </div>
                </th>
              ))}
              <Th>Notes</Th>
              <Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
              <EditorRow
                colSpan={totalCols}
                draft={draft}
                setDraft={setDraft}
                typeOptions={typeOptions}
                responsibleOptions={responsibleOptions}
                deadlineOptions={deadlineOptions}
                frequencyOptions={frequencyOptions}
                onSave={save}
                onCancel={cancel}
                busy={busy}
                adding={adding}
              />
            )}

            {filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={totalCols} className="px-5 py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">
                    {hasFilters ? "No items match these filters." : "No items yet."}
                  </p>
                  {!hasFilters && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First Item
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const expected = expectedMonths(r.frequency, r.dueMonth);
                return editingId === r.id ? (
                  <EditorRow
                    key={r.id}
                    colSpan={totalCols}
                    draft={draft}
                    setDraft={setDraft}
                    typeOptions={typeOptions}
                    responsibleOptions={responsibleOptions}
                    deadlineOptions={deadlineOptions}
                    frequencyOptions={frequencyOptions}
                    onSave={save}
                    onCancel={cancel}
                    busy={busy}
                    adding={false}
                  />
                ) : (
                  <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td className="font-bold text-ink-strong whitespace-nowrap">{r.code || <Dim />}</Td>
                    <Td>
                      {/* Was `whitespace-pre-wrap` at 360px, which let one long
                          item wrap to four lines and set the height of the whole
                          row. It clamps to two lines now and keeps the full text
                          in `title` for hover. */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className="block max-w-[300px] break-words font-semibold text-ink-strong"
                          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}
                          title={r.title}
                        >
                          {r.title}
                        </span>
                        {r.fileLink && /^https?:\/\//i.test(r.fileLink) && (
                          <a href={r.fileLink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-altus-red hover:underline" title="Open linked file">
                            <ExternalLink size={13} strokeWidth={2.4} />
                          </a>
                        )}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{r.responsiblePerson ? <span className="font-semibold text-ink-soft">{r.responsiblePerson}</span> : <Dim />}</Td>
                    <Td><MetaChip value={r.deadline} tone="deadline" /></Td>
                    <Td><MetaChip value={r.type} tone="type" /></Td>
                    <Td className="whitespace-nowrap text-[12px]">{r.frequency || <Dim />}</Td>
                    {cols.map((c) => {
                      const key = monthlyCheckKey(r.id, c.month);
                      return (
                        <td key={c.month} className="px-1 py-1 align-middle" style={{ background: c.month === currentMonth ? "color-mix(in srgb, var(--color-altus-red) 4%, transparent)" : undefined }}>
                          <MonthCell
                            status={grid[key] ?? ""}
                            busy={cellBusy === key}
                            isCurrent={c.month === currentMonth}
                            expected={expected.has(c.month)}
                            onChange={(next) => changeCell(r.id, c.month, next)}
                          />
                        </td>
                      );
                    })}
                    <Td>
                      {/* Both notes clamp to ONE line each with the full text on
                          hover — free-text notes were the other thing setting
                          row height, and they are reference material, not the
                          thing you scan the grid for. */}
                      {r.accountsNotes || r.mananNotes ? (
                        <div className="max-w-[190px] space-y-0.5">
                          {r.accountsNotes && <p className="truncate text-[12px] text-ink-soft" title={r.accountsNotes}>{r.accountsNotes}</p>}
                          {r.mananNotes && (
                            <p className="truncate text-[11.5px]" style={{ color: "var(--color-altus-red-deep)" }} title={r.mananNotes}>
                              <span className="font-bold">Manan Sir:</span> {r.mananNotes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Dim />
                      )}
                    </Td>
                    <Td className="text-right">
                      <RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} />
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* The table is a DENSE GRID, not a set of cards: `px-4 py-3` cells at 14px with
   360px-wide wrapping titles gave rows that ran 60-80px tall, so a 12-month
   checklist showed about six lines per screen. Padding, type and the chips all
   step down together — nothing is removed, it is the same columns and the same
   data at a scannable density. */
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={"px-2.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")}
      style={{ background: "var(--color-surface-soft)" }}
    >
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-2.5 py-1.5 align-middle text-[12.5px] text-ink-soft " + (className ?? "")}>{children}</td>;
}

function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit item" className="inline-flex size-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50">
        <Pencil size={15} strokeWidth={2.2} />
      </button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete item" className="inline-flex size-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50">
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function EditorRow({
  colSpan,
  draft,
  setDraft,
  typeOptions,
  responsibleOptions,
  deadlineOptions,
  frequencyOptions,
  onSave,
  onCancel,
  busy,
  adding,
}: {
  colSpan: number;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  typeOptions: LookupOption[];
  responsibleOptions: LookupOption[];
  deadlineOptions: LookupOption[];
  frequencyOptions: LookupOption[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  adding: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-6 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-lg:col-span-1 max-md:col-span-1">
            <input value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} className={INPUT} placeholder="M1" aria-label="S. No" autoFocus />
          </Field>
          <Field label="Things to get done" className="col-span-10 max-lg:col-span-5 max-md:col-span-1">
            <textarea value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={INPUT + " min-h-[60px] resize-y"} placeholder="What needs to be done…" aria-label="Things to get done" />
          </Field>
          <Field label="Responsible person" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="responsible" kind="monthly_responsible" options={responsibleOptions} value={draft.responsiblePerson} onChange={(v) => setDraft((d) => ({ ...d, responsiblePerson: v }))} placeholder="Person…" />
          </Field>
          <Field label="Deadline" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="deadline" kind="monthly_deadline" options={deadlineOptions} value={draft.deadline} onChange={(v) => setDraft((d) => ({ ...d, deadline: v }))} placeholder="Day…" />
          </Field>
          <Field label="Type" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="type" kind="monthly_type" options={typeOptions} value={draft.type} onChange={(v) => setDraft((d) => ({ ...d, type: v }))} placeholder="Type…" />
          </Field>
          <Field label="Frequency" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <ValueSelect label="frequency" kind="monthly_frequency" options={frequencyOptions} value={draft.frequency} onChange={(v) => setDraft((d) => ({ ...d, frequency: v }))} placeholder="Frequency…" />
          </Field>
          <Field label="Due month (Qtr/Annual)" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <select
              value={draft.dueMonth ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, dueMonth: e.target.value ? Number(e.target.value) : null }))}
              className={INPUT}
              aria-label="Due month"
            >
              <option value="">— auto —</option>
              {MONTH_SHORT.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Accounts notes" className="col-span-5 max-lg:col-span-3 max-md:col-span-2">
            <textarea value={draft.accountsNotes} onChange={(e) => setDraft((d) => ({ ...d, accountsNotes: e.target.value }))} className={INPUT + " min-h-[52px] resize-y"} placeholder="Accounts notes" aria-label="Accounts notes" />
          </Field>
          <Field label="Manan Sir notes" className="col-span-4 max-lg:col-span-3 max-md:col-span-2">
            <textarea value={draft.mananNotes} onChange={(e) => setDraft((d) => ({ ...d, mananNotes: e.target.value }))} className={INPUT + " min-h-[52px] resize-y"} placeholder="Manan Sir notes" aria-label="Manan Sir notes" />
          </Field>
          <Field label="Link to file" className="col-span-3 max-lg:col-span-6 max-md:col-span-2">
            <input value={draft.fileLink} onChange={(e) => setDraft((d) => ({ ...d, fileLink: e.target.value }))} className={INPUT} placeholder="https://…" aria-label="Link to file" />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50">
            <X size={16} strokeWidth={2.4} /> Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Item" : "Save Changes"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={"flex flex-col gap-1.5 " + (className ?? "")}>
      <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
