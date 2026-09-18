"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, Copy, ListChecks, Loader2, Plus, Search, Trash2, X } from "lucide-react";
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
import { CategoryInput, distinctCategories } from "@/components/operations/category-input";
import {
  createChecklistTemplate,
  createTemplateItem,
  duplicateChecklistTemplate,
  removeChecklistItem,
  updateChecklistItem,
  updateChecklistTemplate,
} from "@/app/(app)/operations/checklist/actions";

/**
 * CHECKLIST MASTERS — the reusable checklists, edited directly.
 *
 * Masters on the left (search, new), the open master on the right: its name,
 * type and description, then its rows. Rows save per cell on blur, like the
 * checklist grid — a master is edited a line at a time, and a whole-form Save
 * would lose one person's edit to another's refresh.
 */

const ACCENT = "#B91C1C";
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
}: {
  templates: ChecklistTemplateRow[];
  selected: ChecklistTemplateRow | null;
  items: ChecklistMasterItem[];
  people: ChecklistPersonRow[];
  canEdit: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(canEdit && templates.length === 0);

  const q = query.trim().toLowerCase();
  const shown = q
    ? templates.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
      )
    : templates;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-500">
            Masters <span className="text-slate-400">{templates.length}</span>
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setCreating((c) => !c)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: ACCENT }}
            >
              {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {creating ? "Close" : "New master"}
            </button>
          )}
        </div>

        {creating && <NewMasterForm onDone={() => setCreating(false)} />}

        {templates.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search masters"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-[13px]"
            />
          </div>
        )}

        <ul className="flex max-h-[62vh] flex-col gap-1 overflow-y-auto">
          {shown.map((t) => {
            const active = t.id === selected?.id;
            return (
              <li key={t.id}>
                <Link
                  href={`${BASE}?t=${t.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-xl border px-3 py-2.5 transition-colors ${
                    active ? "border-red-200 bg-red-50" : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  <span className="block truncate text-[13.5px] font-semibold text-slate-900">{t.name}</span>
                  <span className="mt-1 flex items-center gap-2 text-[11.5px] text-slate-500">
                    <TypeBadge isEvent={t.isEvent} />
                    {t.itemCount} row{t.itemCount === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {templates.length === 0 && (
          <p className="px-2 py-3 text-[12.5px] text-slate-500">
            No master checklists yet.{canEdit ? " Create the first one above." : " An admin creates these."}
          </p>
        )}
        {templates.length > 0 && shown.length === 0 && (
          <p className="px-2 py-3 text-[12.5px] text-slate-500">Nothing matches “{query}”.</p>
        )}
      </aside>

      <section className="min-w-0">
        {selected ? (
          <MasterDetail master={selected} items={items} people={people} canEdit={canEdit} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <ListChecks className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-[14px] font-semibold text-slate-700">No master open</p>
            <p className="mt-1 text-[13px] text-slate-500">
              A master is a reusable checklist. Build it once here; every new checklist copies its rows.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── New master ───────────────────────────────────────────────────────────── */

function NewMasterForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { busy, run } = useAction();
  const [name, setName] = React.useState("");
  const [isEvent, setIsEvent] = React.useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() => createChecklistTemplate({ name, isEvent }), "Master created.");
    if (res && res.ok) {
      onDone();
      router.push(`${BASE}?t=${res.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="new-master-name">
        Name
      </label>
      <input
        id="new-master-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Annual Day — standard plan"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
      />
      <TypeToggle isEvent={isEvent} onChange={setIsEvent} />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Create master
      </button>
    </form>
  );
}

/* ── One master ───────────────────────────────────────────────────────────── */

function MasterDetail({
  master,
  items,
  people,
  canEdit,
}: {
  master: ChecklistTemplateRow;
  items: ChecklistMasterItem[];
  people: ChecklistPersonRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { busy, run } = useAction();
  const categories = React.useMemo(() => distinctCategories(items), [items]);
  const nameOf = React.useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const phaseCounts = React.useMemo(() => {
    const c: Record<ChecklistPhase, number> = { before: 0, during: 0, after: 0, undated: 0 };
    for (const it of items) c[phaseFor(it.offsetDays)]++;
    return c;
  }, [items]);
  const withDoer = items.filter((i) => i.doerId).length;

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

  const colCount = 7 + (master.isEvent ? 1 : 0) + (canEdit ? 1 : 0);

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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1080px] text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="w-10 px-3 py-2.5 text-right">#</th>
              <th className="min-w-[240px] px-3 py-2.5">Activity</th>
              <th className="w-40 px-3 py-2.5">Category</th>
              {master.isEvent && <th className="w-28 px-3 py-2.5">Day</th>}
              <th className="w-44 px-3 py-2.5">Doer</th>
              <th className="w-44 px-3 py-2.5">Backup</th>
              <th className="min-w-[180px] px-3 py-2.5">Instructions</th>
              <th className="w-44 px-3 py-2.5">File link</th>
              {canEdit && <th className="w-12 px-2 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-[13px] text-slate-500">
                  No rows yet.{canEdit ? " Add the first activity below." : ""}
                </td>
              </tr>
            ) : (
              items.map((it, i) => (
                <tr key={it.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-1.5 py-1">
                    {canEdit ? (
                      <TextCell
                        value={it.title}
                        required
                        ariaLabel="Activity"
                        onCommit={(v) => v && void saveRow(it.id, { title: v })}
                        className={`${CELL} font-medium`}
                      />
                    ) : (
                      <ReadCell>{it.title}</ReadCell>
                    )}
                  </td>
                  <td className="px-1.5 py-1">
                    {canEdit ? (
                      <CategoryInput
                        value={it.category}
                        suggestions={categories}
                        onCommit={(v) => void saveRow(it.id, { category: v })}
                        className={CELL}
                      />
                    ) : (
                      <ReadCell>{it.category ?? "—"}</ReadCell>
                    )}
                  </td>
                  {master.isEvent && (
                    <td className="px-1.5 py-1">
                      {canEdit ? (
                        <OffsetCell value={it.offsetDays} onCommit={(v) => void saveRow(it.id, { offsetDays: v })} />
                      ) : (
                        <ReadCell>{formatOffset(it.offsetDays)}</ReadCell>
                      )}
                      <span className="block px-2 text-[10.5px] font-semibold text-slate-400">
                        {PHASE_LABELS[phaseFor(it.offsetDays)]}
                      </span>
                    </td>
                  )}
                  <td className="px-1.5 py-1">
                    {canEdit ? (
                      <PersonSelect
                        value={it.doerId}
                        people={people}
                        ariaLabel="Doer"
                        onChange={(v) => void saveRow(it.id, { doerId: v })}
                      />
                    ) : (
                      <ReadCell>{it.doerId ? nameOf.get(it.doerId) ?? "—" : "—"}</ReadCell>
                    )}
                  </td>
                  <td className="px-1.5 py-1">
                    {canEdit ? (
                      <PersonSelect
                        value={it.backupId}
                        people={people}
                        exclude={it.doerId}
                        ariaLabel="Backup"
                        onChange={(v) => void saveRow(it.id, { backupId: v })}
                      />
                    ) : (
                      <ReadCell>{it.backupId ? nameOf.get(it.backupId) ?? "—" : "—"}</ReadCell>
                    )}
                  </td>
                  <td className="px-1.5 py-1">
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
                  <td className="px-1.5 py-1">
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit && <AddRowForm master={master} people={people} categories={categories} />}
    </div>
  );
}

/* ── Add a row ────────────────────────────────────────────────────────────── */

function AddRowForm({
  master,
  people,
  categories,
}: {
  master: ChecklistTemplateRow;
  people: ChecklistPersonRow[];
  categories: readonly string[];
}) {
  const { busy, run } = useAction();
  const listId = React.useId();
  const titleRef = React.useRef<HTMLInputElement>(null);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [offset, setOffset] = React.useState("");
  const [doerId, setDoerId] = React.useState("");
  const [backupId, setBackupId] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const offsetDays = master.isEvent ? parseOffset(offset) : null;
    if (master.isEvent && offset.trim() && offsetDays === null) {
      fireToast({ message: `Day must be a whole number from ${OFFSET_MIN} to ${OFFSET_MAX} (e.g. -3, 0, +1).`, type: "error" });
      return;
    }
    const res = await run(
      () =>
        createTemplateItem({
          templateId: master.id,
          title,
          category: category.trim() || null,
          offsetDays,
          doerId: doerId || null,
          backupId: backupId || null,
        }),
      "Row added.",
    );
    if (res) {
      // Day, doer and backup stay: rows are usually entered in runs that share them.
      setTitle("");
      setCategory("");
      titleRef.current?.focus();
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-500">Add a row</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,2fr)_1fr_110px_1fr_1fr_auto]">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Activity"
          aria-label="Activity"
          className={input}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          aria-label="Category"
          list={listId}
          className={input}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {master.isEvent ? (
          <input
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            placeholder="Day, e.g. -3"
            aria-label="Day relative to the event"
            inputMode="numeric"
            className={input}
          />
        ) : (
          <span className="hidden xl:block" />
        )}
        <select value={doerId} onChange={(e) => setDoerId(e.target.value)} aria-label="Doer" className={input}>
          <option value="">Doer —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={backupId} onChange={(e) => setBackupId(e.target.value)} aria-label="Backup" className={input}>
          <option value="">Backup —</option>
          {people
            .filter((p) => p.id !== doerId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
      {master.isEvent && (
        <p className="mt-2 text-[12px] text-slate-500">
          Day is counted from the event: -3 is three days before, 0 is the event day, +1 the day after.
        </p>
      )}
    </form>
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

function TypeBadge({ isEvent }: { isEvent: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
        isEvent ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isEvent ? "Event-linked" : "Standing"}
    </span>
  );
}

function TypeToggle({
  isEvent,
  onChange,
  disabled = false,
}: {
  isEvent: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const option = (v: boolean, label: string, hint: string) => (
    <button
      type="button"
      title={hint}
      disabled={disabled}
      aria-pressed={isEvent === v}
      onClick={() => onChange(v)}
      className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        isEvent === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {option(true, "Event-linked", "Rows fall on a day counted from the event")}
      {option(false, "Standing", "A standing list — each checklist sets its own dates")}
    </div>
  );
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
