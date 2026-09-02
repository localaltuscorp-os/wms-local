"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { BankItemRow, BankWeekRow, BankBalanceCell } from "@/lib/queries/accounts-bank";
import { parseAmount, formatINR } from "@/lib/accounts/amounts";
import { mergeServerCells, isLatestWrite, type CellMap } from "@/lib/accounts/cell-sync";
import {
  createBankItem, updateBankItem, deleteBankItem,
  createBankWeek, deleteBankWeek, setBankBalance,
} from "@/app/(app)/accounts/bank-balance/actions";

const INPUT = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CELL = "w-full rounded-lg border border-hairline bg-white px-2 py-1.5 text-right text-[12.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)]";

/**
 * How long after the last keystroke a cell saves itself.
 *
 * Saving only on blur meant a value typed and then followed by a refresh was
 * never sent at all — the input never lost focus, so nothing ever fired. Short
 * enough that a normal pause between cells has already committed; long enough
 * that typing a seven-figure balance is one write, not seven.
 */
const AUTOSAVE_MS = 700;

/**
 * The Account column stays put while the week columns scroll under it.
 *
 * An opaque background is not decoration here: a `position: sticky` cell is
 * still in normal flow, so without one the scrolling figures render straight
 * through it. The z-index keeps it above the body cells it overlaps, and below
 * the header row, which is sticky in the other axis.
 */
const STICKY_TD: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 10,
  boxShadow: "1px 0 0 var(--color-hairline)",
};
/** The opaque paint, as classes so the pinned cell still follows row hover —
 *  an inline background would beat the row's `hover:bg-surface-soft` and leave
 *  one cell conspicuously unlit as the pointer crosses the row. */
const STICKY_TD_CLASS = "bg-surface-card group-hover:bg-surface-soft";
const STICKY_TH: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 30,
  background: "var(--color-surface-soft)",
  boxShadow: "1px 0 0 var(--color-hairline)",
};

function Dim() { return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>; }

function lookupAdd(kind: string) {
  return async (name: string) => {
    const res = await addAccountsLookup(kind, name);
    return res.ok ? ({ ok: true as const, option: { id: res.option.id, name: res.option.name } }) : ({ ok: false as const, error: res.error });
  };
}
function ValueSelect({ label, kind, options, value, onChange, placeholder }: { label: string; kind: string; options: LookupOption[]; value: string | null; onChange: (n: string | null) => void; placeholder?: string }) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label={label} value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await lookupAdd(kind)(name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option])); return res; }}
      onDelete={async (id) => { const res = await softDeleteAccountsLookup(id); return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error }); }} />
  );
}

const key = (itemId: string, weekId: string) => `${itemId}:${weekId}`;

type Draft = { code: string; entity: string | null; targetBalance: string };
function emptyDraft(): Draft { return { code: "", entity: null, targetBalance: "" }; }
function toDraft(r: BankItemRow): Draft { return { code: r.code ?? "", entity: r.entity, targetBalance: r.targetBalance ?? "" }; }

export function BankBalance({ fyStartYear, items, weeks, balances, entityOptions }: {
  fyStartYear: number; items: BankItemRow[]; weeks: BankWeekRow[]; balances: BankBalanceCell[]; entityOptions: LookupOption[];
}) {
  /**
   * ── PERSISTENCE (Sir: "it loses what I type when I refresh") ─────────────
   *
   * The write path was always real — `setBankBalance` upserts on
   * (item_id, week_id) and production holds the rows to prove it. Two things
   * stopped that from reaching the screen:
   *
   *  1. NOTHING SAVED UNTIL BLUR. Type a figure, hit refresh, and the input
   *     never lost focus, so no save was ever attempted. Now every keystroke
   *     arms a AUTOSAVE_MS timer; blur, Enter, unmount and page-hide all flush
   *     it early.
   *
   *  2. EVERY REVALIDATE WIPED THE GRID. This effect used to `setGrid(server)`
   *     wholesale, and each cell save calls `revalidatePath`, so one save threw
   *     away whatever had been typed into every OTHER cell since. It now MERGES
   *     (see lib/accounts/cell-sync.ts): the server owns each cell except the
   *     ones the user still owns — unsaved keystrokes, and writes in flight.
   *
   * Ordering is guarded per cell by a ticket, so a slow save landing after a
   * fast one cannot restore the value the user just replaced.
   */
  const serverCells = React.useMemo<CellMap>(() => {
    const m: CellMap = {};
    for (const c of balances) if (c.balance != null) m[key(c.itemId, c.weekId)] = c.balance;
    return m;
  }, [balances]);

  const [grid, setGrid] = React.useState<CellMap>(serverCells);
  const gridRef = React.useRef(grid); gridRef.current = grid;

  /** Typed but not yet sent. */
  const dirtyRef = React.useRef<Set<string>>(new Set());
  /** Sent but not yet confirmed. */
  const inflightRef = React.useRef<Set<string>>(new Set());
  /** Latest write ticket per cell — see isLatestWrite. */
  const seqRef = React.useRef<Map<string, number>>(new Map());
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [cellState, setCellState] = React.useState<Record<string, "saving" | "saved">>({});

  React.useEffect(() => {
    setGrid((cur) =>
      mergeServerCells({
        server: serverCells,
        current: cur,
        protectedKeys: new Set([...dirtyRef.current, ...inflightRef.current]),
      }),
    );
  }, [serverCells]);


  const [q, setQ] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [newWeek, setNewWeek] = React.useState("");
  const [addingWeek, setAddingWeek] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((r) => [r.code, r.entity].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [items, q]);

  // Latest = balance of the highest-sort week that has a value for this entity.
  function latest(itemId: string): number | null {
    for (let i = weeks.length - 1; i >= 0; i--) {
      const v = parseAmount(grid[key(itemId, weeks[i]!.id)]);
      if (v !== null) return v;
    }
    return null;
  }

  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: BankItemRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    const entity = (draft.entity ?? "").trim();
    if (!entity) { fireToast({ message: "An entity is required.", type: "error" }); return; }
    setBusy(true);
    const base = { code: draft.code, entity, targetBalance: draft.targetBalance };
    startTransition(async () => {
      const res = adding ? await createBankItem({ ...base, fyStartYear }) : await updateBankItem({ ...base, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Account added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteBankItem(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Removed.", type: "info" });
    });
  }
  /** Cancel a pending auto-save for one cell. */
  function clearTimer(k: string) {
    const t = timersRef.current.get(k);
    if (t) { clearTimeout(t); timersRef.current.delete(k); }
  }

  /**
   * Send this cell's CURRENT on-screen value. Reads through `gridRef` rather
   * than a captured argument so a flush fired from a timer, a blur and an
   * unmount all send the same thing — the latest keystroke.
   */
  function flushCell(itemId: string, weekId: string) {
    const k = key(itemId, weekId);
    clearTimer(k);
    if (!dirtyRef.current.has(k)) return;

    const n = parseAmount(gridRef.current[k] ?? "");
    const norm = n === null ? "" : String(n);
    dirtyRef.current.delete(k);

    // Nothing to send: the typed value already equals what the server holds
    // (e.g. "1,00,000" re-typed as "100000").
    if (norm === (serverCells[k] ?? "") && !inflightRef.current.has(k)) {
      setCellState((m) => { const x = { ...m }; delete x[k]; return x; });
      return;
    }

    const ticket = (seqRef.current.get(k) ?? 0) + 1;
    seqRef.current.set(k, ticket);
    inflightRef.current.add(k);
    setCellState((m) => ({ ...m, [k]: "saving" }));

    startTransition(async () => {
      const res = await setBankBalance({ itemId, weekId, balance: norm });
      // Superseded: the user typed again while this was in the air. Whatever
      // this reply says is about a value that is no longer on screen, so it
      // must not touch the cell — including on failure.
      if (!isLatestWrite(seqRef.current, k, ticket)) return;
      inflightRef.current.delete(k);
      if (!res.ok) {
        setCellState((m) => { const x = { ...m }; delete x[k]; return x; });
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Show the normalised figure, so the cell reads back exactly what was
      // stored rather than the punctuation it was typed with.
      setGrid((g) => { const x = { ...g }; if (norm) x[k] = norm; else delete x[k]; return x; });
      setCellState((m) => ({ ...m, [k]: "saved" }));
    });
  }

  /** A keystroke: hold it locally, and arm the auto-save. */
  function editCell(itemId: string, weekId: string, raw: string) {
    const k = key(itemId, weekId);
    setGrid((g) => ({ ...g, [k]: raw }));
    dirtyRef.current.add(k);
    clearTimer(k);
    timersRef.current.set(k, setTimeout(() => flushCell(itemId, weekId), AUTOSAVE_MS));
  }

  /**
   * Send everything still pending, now.
   *
   * On unmount this is what stops a navigation from discarding the last cell
   * touched. On `pagehide` it is BEST EFFORT and honest about it: a browser
   * tearing the page down will not wait for a server action to come back. The
   * debounce above is what actually makes a refresh safe — after AUTOSAVE_MS of
   * not typing, the value is already written.
   */
  const flushAllRef = React.useRef<() => void>(() => {});
  flushAllRef.current = () => {
    for (const k of [...dirtyRef.current]) {
      const [itemId, weekId] = k.split(":");
      if (itemId && weekId) flushCell(itemId, weekId);
    }
  };

  React.useEffect(() => {
    const onHide = () => flushAllRef.current();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    const timers = timersRef.current;
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushAllRef.current();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);

  /** Clear a cell's "Saved" tick a moment after it appears. */
  React.useEffect(() => {
    const saved = Object.entries(cellState).filter(([, v]) => v === "saved").map(([k]) => k);
    if (saved.length === 0) return;
    const t = setTimeout(() => {
      setCellState((m) => {
        const x = { ...m };
        for (const k of saved) if (x[k] === "saved") delete x[k];
        return x;
      });
    }, 1600);
    return () => clearTimeout(t);
  }, [cellState]);
  function addWeek() {
    const label = newWeek.trim();
    if (!label) return;
    setAddingWeek(true);
    startTransition(async () => {
      const res = await createBankWeek({ fyStartYear, label });
      setAddingWeek(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setNewWeek("");
      fireToast({ message: `Week "${label}" added.`, type: "success" });
    });
  }
  function removeWeek(id: string, label: string) {
    startTransition(async () => {
      const res = await deleteBankWeek(id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Week "${label}" removed.`, type: "info" });
    });
  }

  const totalCols = 2 + weeks.length + 3; // entity + target + weeks + latest + diff + actions

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — accounts" title="Local search — filters only the list on this page" aria-label="Local search — accounts — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        {/* Add a weekly snapshot column */}
        <div className="flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2 py-1">
          <input value={newWeek} onChange={(e) => setNewWeek(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWeek(); } }} placeholder="New week e.g. 27.06.2026" className="w-[150px] bg-transparent px-1 py-1.5 text-[13.5px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle" aria-label="New week label" />
          <button type="button" onClick={addWeek} disabled={addingWeek || !newWeek.trim()} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-ink-strong)" }}>
            {addingWeek ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.6} />} Week
          </button>
        </div>
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add Account
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "account" : "accounts"} · {weeks.length} weeks</div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 720 + weeks.length * 104 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              {/* Pinned: the week columns scroll under it (STICKY_TH). */}
              <Th style={STICKY_TH}>Account</Th>
              <Th className="text-right">Target</Th>
              {weeks.map((w) => (
                <th key={w.id} className="group/wk px-2 py-2.5 text-center text-[11px] font-bold text-ink-subtle whitespace-nowrap" style={{ background: "var(--color-surface-soft)" }}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-ink-strong">{w.label}</span>
                    <WeekDelete onDelete={() => removeWeek(w.id, w.label)} />
                  </div>
                </th>
              ))}
              <Th className="text-right">Latest</Th>
              <Th className="text-right">Diff vs target</Th>
              <Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
              <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />
            )}
            {filtered.length === 0 && !adding ? (
              <tr><td colSpan={totalCols} className="px-5 py-16 text-center"><p className="text-[15px] font-semibold text-ink-muted">{q ? "No accounts match." : "No accounts for this financial year yet."}</p>{!q && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the First Account</button>}</td></tr>
            ) : (
              filtered.map((r) => {
                if (editingId === r.id) return <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />;
                const target = parseAmount(r.targetBalance);
                const last = latest(r.id);
                const diff = last !== null && target !== null ? last - target : null;
                return (
                  <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td className={"whitespace-nowrap " + STICKY_TD_CLASS} style={STICKY_TD}>
                      <div className="flex items-center gap-2">
                        {r.code && <span className="text-[11px] font-bold text-ink-subtle">#{r.code}</span>}
                        <span className="font-bold text-ink-strong">{r.entity}</span>
                      </div>
                    </Td>
                    <Td className="text-right font-semibold text-ink-soft whitespace-nowrap">{target !== null ? `₹${formatINR(target)}` : <Dim />}</Td>
                    {weeks.map((w) => {
                      const k = key(r.id, w.id);
                      return (
                        <td key={w.id} className="px-1.5 py-2 align-middle">
                          <BalanceCell
                        value={grid[k] ?? ""}
                        state={cellState[k]}
                        onEdit={(v) => editCell(r.id, w.id, v)}
                        onFlush={() => flushCell(r.id, w.id)}
                        label={`${r.entity} balance ${w.label}`}
                      />
                        </td>
                      );
                    })}
                    <Td className="text-right font-bold text-ink-strong whitespace-nowrap">{last !== null ? `₹${formatINR(last)}` : <Dim />}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {diff !== null ? (
                        <span className="font-bold" style={{ color: diff < 0 ? "var(--color-altus-red-deep)" : "var(--color-green-deep)" }}>
                          {diff < 0 ? `−₹${formatINR(Math.abs(diff))}` : `+₹${formatINR(diff)}`}
                        </span>
                      ) : <Dim />}
                    </Td>
                    <Td className="text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} /></Td>
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

function WeekDelete({ onDelete }: { onDelete: () => void }) {
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 3000); return () => clearTimeout(t); }, [confirm]);
  return confirm ? (
    <button type="button" onClick={onDelete} aria-label="Confirm delete week" className="inline-flex items-center rounded px-1 text-[10px] font-bold text-white" style={{ background: "var(--color-altus-red)" }}>del?</button>
  ) : (
    <button type="button" onClick={() => setConfirm(true)} aria-label="Delete week" className="opacity-0 group-hover/wk:opacity-100 transition-opacity text-ink-subtle hover:text-altus-red"><X size={12} strokeWidth={2.6} /></button>
  );
}

function Th({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <th className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)", ...style }}>{children}</th>;
}
function Td({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td className={"px-4 py-3 align-middle text-[14px] text-ink-soft " + (className ?? "")} style={style}>{children}</td>;
}

/**
 * One week's balance for one account.
 *
 * Saves ITSELF: every keystroke re-arms the debounce upstairs, and leaving the
 * field flushes it early. There is no Save button on this screen and there
 * never was one — what was missing was the saving actually happening, and any
 * sign of it having happened. The dot is that sign, deliberately small: a
 * grid of a hundred cells cannot afford a spinner each.
 */
function BalanceCell({ value, state, onEdit, onFlush, label }: {
  value: string;
  state: "saving" | "saved" | undefined;
  onEdit: (v: string) => void;
  onFlush: () => void;
  label: string;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => onEdit(e.target.value)}
        onBlur={onFlush}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className={CELL}
        style={{ minWidth: 92, paddingRight: state ? 18 : undefined }}
        aria-label={label}
        placeholder="—"
      />
      {state && (
        <span
          aria-hidden
          title={state === "saving" ? "Saving…" : "Saved"}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          {state === "saving"
            ? <Loader2 size={11} className="animate-spin" style={{ color: "var(--color-ink-subtle)" }} />
            : <Check size={12} strokeWidth={3} style={{ color: "var(--color-green-deep)" }} />}
        </span>
      )}
    </div>
  );
}

function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => { if (!confirming) return; const t = setTimeout(() => setConfirming(false), 3500); return () => clearTimeout(t); }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit account" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><Pencil size={15} strokeWidth={2.2} /></button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm</button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete account" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"><Trash2 size={15} strokeWidth={2.2} /></button>
      )}
    </div>
  );
}

function EditorRow({ colSpan, draft, setDraft, entityOptions, onSave, onCancel, busy, adding }: {
  colSpan: number; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; entityOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1"><input value={draft.code} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus /></Field>
          <Field label="Account / entity" className="col-span-6 max-md:col-span-1"><ValueSelect label="account" kind="bank_entity" options={entityOptions} value={draft.entity} onChange={(v) => set({ entity: v })} placeholder="Account…" /></Field>
          <Field label="Target balance (₹)" className="col-span-4 max-md:col-span-2"><input value={draft.targetBalance} onChange={(e) => set({ targetBalance: e.target.value })} className={INPUT} inputMode="numeric" placeholder="400000" aria-label="Target balance" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Account" : "Save Changes"}</button>
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
