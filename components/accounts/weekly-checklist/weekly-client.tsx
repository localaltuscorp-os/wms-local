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
import type { WeeklyItemRow, WeeklyCheckCell } from "@/lib/queries/accounts-weekly";
import {
  WEEKLY_CHECK_STATUSES,
  weeklyStatusTone,
  checkKey,
  type WeekOfMonth,
} from "@/lib/accounts/weekly";
import {
  createWeeklyItem,
  updateWeeklyItem,
  deleteWeeklyItem,
  setWeeklyCheck,
} from "@/app/(app)/accounts/weekly-checklist/actions";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CHIP =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

// ── Managed dropdown plumbing (mirrors the Task List section) ─────────────────

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

function MetaChip({ value, tone }: { value: string | null; tone?: "deadline" | "category" }) {
  if (!value) return <Dim />;
  const palette =
    tone === "deadline"
      ? { bg: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", fg: "var(--color-altus-red-deep)" }
      : { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-soft)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {value}
    </span>
  );
}

// ── A single editable week-status cell ────────────────────────────────────────

function WeekCell({
  status,
  busy,
  onChange,
  highlight,
}: {
  status: string;
  busy: boolean;
  onChange: (next: string) => void;
  highlight: boolean;
}) {
  const tone = weeklyStatusTone(status);
  return (
    <div className="relative">
      <select
        value={status}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Week status"
        className="w-full cursor-pointer appearance-none rounded-lg px-2 py-1.5 text-center text-[12.5px] font-bold outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:opacity-60"
        style={{
          background: tone.bg,
          color: tone.fg,
          border: highlight
            ? "1.5px solid var(--color-altus-red)"
            : `1px solid ${status ? "transparent" : "var(--color-hairline)"}`,
          minWidth: 92,
        }}
      >
        <option value="">—</option>
        {WEEKLY_CHECK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === "Not Applicable" ? "N/A" : s}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Item draft ────────────────────────────────────────────────────────────────

type Draft = {
  code: string;
  title: string;
  deadline: string | null;
  category: string | null;
  responsiblePerson: string | null;
  frequency: string | null;
  accountsNotes: string;
  mananNotes: string;
  fileLink: string;
};

function emptyDraft(): Draft {
  return {
    code: "",
    title: "",
    deadline: null,
    category: null,
    responsiblePerson: null,
    frequency: null,
    accountsNotes: "",
    mananNotes: "",
    fileLink: "",
  };
}
function toDraft(r: WeeklyItemRow): Draft {
  return {
    code: r.code ?? "",
    title: r.title,
    deadline: r.deadline,
    category: r.category,
    responsiblePerson: r.responsiblePerson,
    frequency: r.frequency,
    accountsNotes: r.accountsNotes ?? "",
    mananNotes: r.mananNotes ?? "",
    fileLink: r.fileLink ?? "",
  };
}

// ════════════════════════════════════════════════════════════════════════════

export function WeeklyChecklist({
  year,
  month,
  weeks,
  currentWeekNo,
  items,
  checks,
  deadlineOptions,
  categoryOptions,
  responsibleOptions,
  frequencyOptions,
}: {
  year: number;
  month: number;
  weeks: WeekOfMonth[];
  currentWeekNo: number | null;
  items: WeeklyItemRow[];
  checks: WeeklyCheckCell[];
  deadlineOptions: LookupOption[];
  categoryOptions: LookupOption[];
  responsibleOptions: LookupOption[];
  frequencyOptions: LookupOption[];
}) {
  // Live, optimistic copy of the check grid (key = itemId:weekNo).
  const [grid, setGrid] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of checks) m[checkKey(c.itemId, c.weekNo)] = c.status;
    return m;
  });
  React.useEffect(() => {
    const m: Record<string, string> = {};
    for (const c of checks) m[checkKey(c.itemId, c.weekNo)] = c.status;
    setGrid(m);
  }, [checks]);

  const [q, setQ] = React.useState("");
  const [fCategory, setFCategory] = React.useState("");
  const [fDeadline, setFDeadline] = React.useState("");
  const [fResponsible, setFResponsible] = React.useState("");

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [cellBusy, setCellBusy] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const categories = React.useMemo(
    () => Array.from(new Set([...categoryOptions.map((o) => o.name), ...items.map((i) => i.category ?? "")].filter(Boolean))),
    [categoryOptions, items],
  );
  const deadlines = React.useMemo(
    () => Array.from(new Set([...deadlineOptions.map((o) => o.name), ...items.map((i) => i.deadline ?? "")].filter(Boolean))),
    [deadlineOptions, items],
  );
  const responsibles = React.useMemo(
    () => Array.from(new Set([...responsibleOptions.map((o) => o.name), ...items.map((i) => i.responsiblePerson ?? "")].filter(Boolean))),
    [responsibleOptions, items],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (fCategory && (r.category ?? "") !== fCategory) return false;
      if (fDeadline && (r.deadline ?? "") !== fDeadline) return false;
      if (fResponsible && (r.responsiblePerson ?? "") !== fResponsible) return false;
      if (needle) {
        const hay = [r.code, r.title, r.category, r.deadline, r.responsiblePerson, r.accountsNotes, r.mananNotes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, fCategory, fDeadline, fResponsible]);

  // Per-week done count (across all non-archived items, for the selected month).
  const doneByWeek = React.useMemo(() => {
    const counts: Record<number, number> = {};
    for (const w of weeks) counts[w.weekNo] = 0;
    for (const c of checks) {
      if (c.status === "Done" && counts[c.weekNo] !== undefined) {
        counts[c.weekNo] = (counts[c.weekNo] ?? 0) + 1;
      }
    }
    return counts;
  }, [checks, weeks]);

  const hasFilters = q || fCategory || fDeadline || fResponsible;
  function clearFilters() {
    setQ("");
    setFCategory("");
    setFDeadline("");
    setFResponsible("");
  }

  function startAdd() {
    setEditingId(null);
    setDraft(emptyDraft());
    setAdding(true);
  }
  function startEdit(r: WeeklyItemRow) {
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
      deadline: draft.deadline,
      category: draft.category,
      responsiblePerson: draft.responsiblePerson,
      frequency: draft.frequency,
      accountsNotes: draft.accountsNotes,
      mananNotes: draft.mananNotes,
      fileLink: draft.fileLink,
    };
    startTransition(async () => {
      const res = adding
        ? await createWeeklyItem(payload)
        : await updateWeeklyItem({ ...payload, id: editingId });
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
      const res = await deleteWeeklyItem(id);
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Item removed.", type: "info" });
    });
  }

  function changeCell(itemId: string, weekNo: number, next: string) {
    const key = checkKey(itemId, weekNo);
    const prev = grid[key] ?? "";
    setGrid((g) => {
      const n = { ...g };
      if (next) n[key] = next;
      else delete n[key];
      return n;
    });
    setCellBusy(key);
    startTransition(async () => {
      const res = await setWeeklyCheck({ itemId, year, month, weekNo, status: next });
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

  const META_COLS = 6; // code, title, deadline, category, responsible, freq
  const totalCols = META_COLS + weeks.length + 2; // + week cols + notes + actions

  return (
    <section className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — checklist, notes, responsible" title="Local search — filters only the list on this page" aria-label="Local search — checklist, notes, responsible — this page only"
            className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
        </div>
        <select className={CHIP} value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} aria-label="Filter by deadline">
          <option value="">All Deadlines</option>
          {deadlines.map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
        <select className={CHIP} value={fCategory} onChange={(e) => setFCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All Categories</option>
          {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select className={CHIP} value={fResponsible} onChange={(e) => setFResponsible(e.target.value)} aria-label="Filter by responsible">
          <option value="">All People</option>
          {responsibles.map((p) => (<option key={p} value={p}>{p}</option>))}
        </select>
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
          <Plus size={16} strokeWidth={2.6} /> Add Item
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "item" : "items"}
        {hasFilters ? ` · filtered from ${items.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1180 + weeks.length * 110 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>S. No</Th>
              <Th>Weekly checklist</Th>
              <Th>Deadline</Th>
              <Th>Category</Th>
              <Th>Responsible</Th>
              <Th>Freq</Th>
              {weeks.map((w) => (
                <th
                  key={w.weekNo}
                  className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle whitespace-nowrap"
                  style={{
                    background: w.weekNo === currentWeekNo
                      ? "color-mix(in srgb, var(--color-altus-red) 9%, var(--color-surface-soft))"
                      : "var(--color-surface-soft)",
                  }}
                >
                  <div className="text-ink-strong">Wk{w.weekNo}</div>
                  <div className="text-[10px] font-semibold normal-case tracking-normal text-ink-subtle">{w.label}</div>
                  <div className="mt-0.5 text-[10px] font-bold text-green-deep" style={{ color: "var(--color-green-deep)" }}>
                    {doneByWeek[w.weekNo] ?? 0}/{items.length} done
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
                deadlineOptions={deadlineOptions}
                categoryOptions={categoryOptions}
                responsibleOptions={responsibleOptions}
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
                    {hasFilters ? "No items match these filters." : "No weekly items yet."}
                  </p>
                  {!hasFilters && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First Item
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) =>
                editingId === r.id ? (
                  <EditorRow
                    key={r.id}
                    colSpan={totalCols}
                    draft={draft}
                    setDraft={setDraft}
                    deadlineOptions={deadlineOptions}
                    categoryOptions={categoryOptions}
                    responsibleOptions={responsibleOptions}
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
                      <div className="flex items-start gap-2">
                        <span className="block max-w-[420px] whitespace-pre-wrap break-words font-semibold text-ink-strong">{r.title}</span>
                        {r.fileLink && /^https?:\/\//i.test(r.fileLink) && (
                          <a href={r.fileLink} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-altus-red hover:underline" title="Open linked file">
                            <ExternalLink size={14} strokeWidth={2.4} />
                          </a>
                        )}
                      </div>
                    </Td>
                    <Td><MetaChip value={r.deadline} tone="deadline" /></Td>
                    <Td><MetaChip value={r.category} tone="category" /></Td>
                    <Td className="whitespace-nowrap">{r.responsiblePerson ? <span className="font-semibold text-ink-soft">{r.responsiblePerson}</span> : <Dim />}</Td>
                    <Td className="whitespace-nowrap text-[13px]">{r.frequency || <Dim />}</Td>
                    {weeks.map((w) => {
                      const key = checkKey(r.id, w.weekNo);
                      return (
                        <td key={w.weekNo} className="px-1.5 py-2 align-middle" style={{ background: w.weekNo === currentWeekNo ? "color-mix(in srgb, var(--color-altus-red) 4%, transparent)" : undefined }}>
                          <WeekCell
                            status={grid[key] ?? ""}
                            busy={cellBusy === key}
                            highlight={w.weekNo === currentWeekNo}
                            onChange={(next) => changeCell(r.id, w.weekNo, next)}
                          />
                        </td>
                      );
                    })}
                    <Td>
                      {r.accountsNotes || r.mananNotes ? (
                        <div className="max-w-[240px] space-y-1">
                          {r.accountsNotes && <p className="whitespace-pre-wrap break-words text-[13px] text-ink-soft" title={r.accountsNotes}>{r.accountsNotes}</p>}
                          {r.mananNotes && (
                            <p className="whitespace-pre-wrap break-words text-[12.5px]" style={{ color: "var(--color-altus-red-deep)" }} title={r.mananNotes}>
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
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")}
      style={{ background: "var(--color-surface-soft)" }}
    >
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-4 py-3 align-top text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
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
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit item" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50">
        <Pencil size={15} strokeWidth={2.2} />
      </button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete item" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50">
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
  deadlineOptions,
  categoryOptions,
  responsibleOptions,
  frequencyOptions,
  onSave,
  onCancel,
  busy,
  adding,
}: {
  colSpan: number;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  deadlineOptions: LookupOption[];
  categoryOptions: LookupOption[];
  responsibleOptions: LookupOption[];
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
            <input value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} className={INPUT} placeholder="W1" aria-label="S. No" autoFocus />
          </Field>
          <Field label="Weekly checklist" className="col-span-10 max-lg:col-span-5 max-md:col-span-1">
            <textarea value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={INPUT + " min-h-[60px] resize-y"} placeholder="What needs to be done…" aria-label="Weekly checklist" />
          </Field>
          <Field label="Deadline" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="deadline" kind="weekly_deadline" options={deadlineOptions} value={draft.deadline} onChange={(v) => setDraft((d) => ({ ...d, deadline: v }))} placeholder="Day…" />
          </Field>
          <Field label="Category" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="category" kind="weekly_category" options={categoryOptions} value={draft.category} onChange={(v) => setDraft((d) => ({ ...d, category: v }))} placeholder="Category…" />
          </Field>
          <Field label="Responsible person" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="responsible" kind="weekly_responsible" options={responsibleOptions} value={draft.responsiblePerson} onChange={(v) => setDraft((d) => ({ ...d, responsiblePerson: v }))} placeholder="Person…" />
          </Field>
          <Field label="Frequency" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <ValueSelect label="frequency" kind="weekly_frequency" options={frequencyOptions} value={draft.frequency} onChange={(v) => setDraft((d) => ({ ...d, frequency: v }))} placeholder="Frequency…" />
          </Field>
          <Field label="Accounts notes" className="col-span-4 max-lg:col-span-3 max-md:col-span-2">
            <textarea value={draft.accountsNotes} onChange={(e) => setDraft((d) => ({ ...d, accountsNotes: e.target.value }))} className={INPUT + " min-h-[52px] resize-y"} placeholder="Accounts notes" aria-label="Accounts notes" />
          </Field>
          <Field label="Manan Sir notes" className="col-span-4 max-lg:col-span-3 max-md:col-span-2">
            <textarea value={draft.mananNotes} onChange={(e) => setDraft((d) => ({ ...d, mananNotes: e.target.value }))} className={INPUT + " min-h-[52px] resize-y"} placeholder="Manan Sir notes" aria-label="Manan Sir notes" />
          </Field>
          <Field label="Link to file" className="col-span-4 max-lg:col-span-6 max-md:col-span-2">
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
