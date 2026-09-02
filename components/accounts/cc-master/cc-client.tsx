"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2, Download, CalendarRange, ArrowUp, ArrowDown, RotateCcw, Archive, ChevronDown, ChevronRight, CalendarClock } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { CcCardRow, CcMonthRow } from "@/lib/queries/accounts-cc";
import { CC_YESNO, CC_TALLY, CC_BALANCE, ccMonthKey, ccTone, MONTH_LABELS, fyMonthCols, fyLabel } from "@/lib/accounts/cc";
import { createCcCard, updateCcCard, deleteCcCard, saveCcMonth, carryForwardCcCards, restoreCcCard, moveCcCard } from "@/app/(app)/accounts/cc-tracker/actions";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CELL_INPUT =
  "w-full rounded-lg border border-hairline bg-white px-2 py-1.5 text-[12.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)]";

type MonthRec = {
  hardCopy: string; googleDrive: string; tallyEntry: string; balanceTally: string;
  ccPaidDate: string; ccPaidAmt: string; intFinChgs: string; chgReversed: string; notes: string;
};
function emptyRec(): MonthRec {
  return { hardCopy: "", googleDrive: "", tallyEntry: "", balanceTally: "", ccPaidDate: "", ccPaidAmt: "", intFinChgs: "", chgReversed: "", notes: "" };
}
function recFrom(m: CcMonthRow): MonthRec {
  return {
    hardCopy: m.hardCopy ?? "", googleDrive: m.googleDrive ?? "", tallyEntry: m.tallyEntry ?? "",
    balanceTally: m.balanceTally ?? "", ccPaidDate: m.ccPaidDate ?? "", ccPaidAmt: m.ccPaidAmt ?? "",
    intFinChgs: m.intFinChgs ?? "", chgReversed: m.chgReversed ?? "", notes: m.notes ?? "",
  };
}

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}

function lookupAdd(kind: string) {
  return async (name: string) => {
    const res = await addAccountsLookup(kind, name);
    return res.ok ? ({ ok: true as const, option: { id: res.option.id, name: res.option.name } }) : ({ ok: false as const, error: res.error });
  };
}
function lookupDelete() {
  return async (id: string) => {
    const res = await softDeleteAccountsLookup(id);
    return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error });
  };
}
function ValueSelect({ label, kind, options, value, onChange, placeholder }: {
  label: string; kind: string; options: LookupOption[]; value: string | null; onChange: (name: string | null) => void; placeholder?: string;
}) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label={label} value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await lookupAdd(kind)(name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option])); return res; }}
      onDelete={lookupDelete()} />
  );
}

/** Small select used inside the monthly cells. */
function CellSelect({ value, options, onChange, busy }: { value: string; options: readonly string[]; onChange: (v: string) => void; busy: boolean }) {
  const t = ccTone(value);
  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Status"
      className="w-full cursor-pointer appearance-none rounded-lg px-2 py-1.5 text-center text-[12px] font-bold outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{ background: t?.bg ?? "transparent", color: t?.fg ?? "var(--color-ink-subtle)", border: `1px solid ${value ? "transparent" : "var(--color-hairline)"}`, minWidth: 70 }}
    >
      <option value="">—</option>
      {options.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  );
}

type CardDraft = {
  code: string; entityName: string | null; cardName: string; ecs: string | null; ecsFrom: string | null;
  stmtPeriod: string; stmtStartDay: string; dueDay: string; softCopyAutoEmail: string | null;
};
function emptyCard(): CardDraft {
  return { code: "", entityName: null, cardName: "", ecs: null, ecsFrom: null, stmtPeriod: "", stmtStartDay: "", dueDay: "", softCopyAutoEmail: null };
}
function toCardDraft(r: CcCardRow): CardDraft {
  return {
    code: r.code ?? "", entityName: r.entityName, cardName: r.cardName, ecs: r.ecs, ecsFrom: r.ecsFrom,
    stmtPeriod: r.stmtPeriod ?? "", stmtStartDay: r.stmtStartDay ?? "", dueDay: r.dueDay ?? "", softCopyAutoEmail: r.softCopyAutoEmail,
  };
}

export function CcMaster({
  fyStartYear, month, cards, months, entityOptions, archivedCards = [], prevFyCount = 0,
}: {
  fyStartYear: number; month: number; cards: CcCardRow[]; months: CcMonthRow[]; entityOptions: LookupOption[];
  archivedCards?: CcCardRow[]; prevFyCount?: number;
}) {
  const router = useRouter();
  // Month records for the *selected* month, keyed by cardId.
  const [recs, setRecs] = React.useState<Record<string, MonthRec>>({});
  React.useEffect(() => {
    const m: Record<string, MonthRec> = {};
    for (const row of months) if (row.month === month) m[row.cardId] = recFrom(row);
    setRecs(m);
  }, [months, month]);

  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<CardDraft>(emptyCard);
  const [busy, setBusy] = React.useState(false);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [yearCard, setYearCard] = React.useState<CcCardRow | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [, startTransition] = React.useTransition();

  // All month records for the card whose full-year view is open.
  const yearMonths = React.useMemo(
    () => (yearCard ? months.filter((m) => m.cardId === yearCard.id) : []),
    [months, yearCard],
  );

  function carryForward() {
    setBusy(true);
    startTransition(async () => {
      const res = await carryForwardCcCards({ fromFy: fyStartYear - 1, toFy: fyStartYear });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: res.copied ? `Carried forward ${res.copied} card${res.copied === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} already here` : ""}.` : "All cards were already here.", type: res.copied ? "success" : "info" });
      router.refresh();
    });
  }

  function restore(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await restoreCcCard(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Card restored.", type: "success" });
      router.refresh();
    });
  }

  function move(id: string, direction: "up" | "down") {
    setRowBusy(id);
    startTransition(async () => {
      const res = await moveCcCard({ id, direction });
      setRowBusy(null);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      router.refresh();
    });
  }

  const entities = React.useMemo(
    () => Array.from(new Set([...entityOptions.map((o) => o.name), ...cards.map((c) => c.entityName ?? "")].filter(Boolean))),
    [entityOptions, cards],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (fEntity && (c.entityName ?? "") !== fEntity) return false;
      if (needle) {
        const hay = [c.code, c.entityName, c.cardName, c.ecsFrom, c.stmtPeriod].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [cards, q, fEntity]);

  const hasFilters = q || fEntity;
  function clearFilters() { setQ(""); setFEntity(""); }
  function startAdd() { setEditingId(null); setDraft(emptyCard()); setAdding(true); }
  function startEdit(c: CcCardRow) { setAdding(false); setDraft(toCardDraft(c)); setEditingId(c.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function saveCard() {
    const cardName = draft.cardName.trim();
    if (!cardName) { fireToast({ message: "A card name is required.", type: "error" }); return; }
    setBusy(true);
    const base = { ...draft, cardName };
    startTransition(async () => {
      const res = adding
        ? await createCcCard({ ...base, fyStartYear })
        : await updateCcCard({ ...base, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Card added." : "Card saved.", type: "success" });
      cancel();
    });
  }

  function removeCard(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteCcCard(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Card removed.", type: "info" });
    });
  }

  function commit(cardId: string, next: MonthRec) {
    setRowBusy(cardId);
    startTransition(async () => {
      const res = await saveCcMonth({ cardId, month, ...next });
      setRowBusy(null);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }
  /** Update one field locally and persist the whole record. */
  function setField(cardId: string, field: keyof MonthRec, value: string, persist: boolean) {
    setRecs((prev) => {
      const cur = prev[cardId] ?? emptyRec();
      const next = { ...cur, [field]: value };
      const out = { ...prev, [cardId]: next };
      if (persist) commit(cardId, next);
      return out;
    });
  }

  const totalCols = 11;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — cards, entity" title="Local search — filters only the list on this page" aria-label="Local search — cards, entity — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" value={fEntity} onChange={(e) => setFEntity(e.target.value)} aria-label="Filter by entity">
          <option value="">All Entities</option>
          {entities.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
        <span className="text-[13px] font-bold text-ink-soft">Editing: <span className="text-altus-red">{MONTH_LABELS[month - 1]}</span></span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {cards.length === 0 && prevFyCount > 0 && (
            <button type="button" onClick={carryForward} disabled={busy} title={`Copy all ${prevFyCount} cards from ${fyLabel(fyStartYear - 1)}`} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2.5 px-4 text-[14px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} strokeWidth={2.4} />} Start from {fyLabel(fyStartYear - 1)}
            </button>
          )}
          <a href={`/accounts/cc-tracker/export?fy=${fyStartYear}`} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2.5 px-4 text-[14px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red" title="Download this year as an Excel file">
            <Download size={15} strokeWidth={2.4} /> Export
          </a>
          <button type="button" onClick={startAdd} className="inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
            <Plus size={16} strokeWidth={2.6} /> Add Card
          </button>
        </div>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "card" : "cards"}{hasFilters ? ` · filtered from ${cards.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1320 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>Card</Th><Th>Hard copy</Th><Th>G-Drive</Th><Th>Tally</Th><Th>Balance</Th>
              <Th>Paid date</Th><Th>Paid amt</Th><Th>Int+Fin</Th><Th>Chg rev?</Th><Th>Notes</Th><Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
              <CardEditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={saveCard} onCancel={cancel} busy={busy} adding={adding} />
            )}
            {filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={totalCols} className="px-5 py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No cards match these filters." : "No cards for this financial year yet."}</p>
                  {!hasFilters && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First Card
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                if (editingId === c.id) {
                  return <CardEditorRow key={c.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={saveCard} onCancel={cancel} busy={busy} adding={false} />;
                }
                const rec = recs[c.id] ?? emptyRec();
                const rb = rowBusy === c.id;
                return (
                  <tr key={c.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td>
                      <button type="button" onClick={() => setYearCard(c)} title="View all 12 months" className="group/name min-w-[200px] max-w-[280px] text-left">
                        <div className="flex items-center gap-2">
                          {c.code && <span className="text-[11px] font-bold text-ink-subtle">#{c.code}</span>}
                          <span className="font-bold text-ink-strong group-hover/name:text-altus-red transition-colors">{c.cardName}</span>
                          <CalendarRange size={13} className="text-ink-subtle opacity-0 group-hover/name:opacity-100 transition-opacity" />
                        </div>
                        <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
                          {[c.entityName, c.ecs && `ECS: ${c.ecs}`, c.stmtPeriod, c.dueDay && `Due ${c.dueDay}`].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                    </Td>
                    <CellTd><CellSelect value={rec.hardCopy} options={CC_YESNO} busy={rb} onChange={(v) => setField(c.id, "hardCopy", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.googleDrive} options={CC_YESNO} busy={rb} onChange={(v) => setField(c.id, "googleDrive", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.tallyEntry} options={CC_TALLY} busy={rb} onChange={(v) => setField(c.id, "tallyEntry", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.balanceTally} options={CC_BALANCE} busy={rb} onChange={(v) => setField(c.id, "balanceTally", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.ccPaidDate} busy={rb} placeholder="date" onChange={(v) => setField(c.id, "ccPaidDate", v, false)} onCommit={(v) => setField(c.id, "ccPaidDate", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.ccPaidAmt} busy={rb} placeholder="₹" onChange={(v) => setField(c.id, "ccPaidAmt", v, false)} onCommit={(v) => setField(c.id, "ccPaidAmt", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.intFinChgs} busy={rb} placeholder="0" onChange={(v) => setField(c.id, "intFinChgs", v, false)} onCommit={(v) => setField(c.id, "intFinChgs", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.chgReversed} options={CC_YESNO} busy={rb} onChange={(v) => setField(c.id, "chgReversed", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.notes} busy={rb} placeholder="notes" wide onChange={(v) => setField(c.id, "notes", v, false)} onCommit={(v) => setField(c.id, "notes", v, true)} /></CellTd>
                    <Td className="text-right"><RowActions onEdit={() => startEdit(c)} onDelete={() => removeCard(c.id)} onMoveUp={() => move(c.id, "up")} onMoveDown={() => move(c.id, "down")} canReorder={!hasFilters} isFirst={cards[0]?.id === c.id} isLast={cards[cards.length - 1]?.id === c.id} busy={busy || rb} /></Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Archived (soft-deleted) cards — visible + restorable so nothing is ever lost. */}
      {archivedCards.length > 0 && (
        <div className="rounded-section border border-hairline bg-surface-card">
          <button type="button" onClick={() => setShowArchived((s) => !s)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            {showArchived ? <ChevronDown size={16} className="text-ink-subtle" /> : <ChevronRight size={16} className="text-ink-subtle" />}
            <Archive size={15} className="text-ink-subtle" strokeWidth={2.2} />
            <span className="text-[13.5px] font-bold text-ink-soft">Archived Cards</span>
            <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11.5px] font-bold text-ink-subtle">{archivedCards.length}</span>
          </button>
          {showArchived && (
            <div className="border-t border-hairline">
              {archivedCards.map((c) => (
                <div key={c.id} className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-[14px] font-bold text-ink-soft">{c.code ? `#${c.code} · ` : ""}{c.cardName}</span>
                    <span className="ml-2 text-[12px] font-semibold text-ink-subtle">{[c.entityName, c.stmtPeriod].filter(Boolean).join(" · ")}</span>
                  </div>
                  <button type="button" onClick={() => restore(c.id)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-green)] hover:text-[color:var(--color-green-deep)] disabled:opacity-50">
                    <RotateCcw size={14} strokeWidth={2.4} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {yearCard && (
        <CardYearDrawer
          card={yearCard}
          fyStartYear={fyStartYear}
          monthRows={yearMonths}
          onClose={() => setYearCard(null)}
        />
      )}
    </section>
  );
}

/**
 * Full-year view for one card — all 12 FY months (Apr→Mar) as rows, each with
 * the 9 tracked fields, editable inline (autosaves per field). Restores the
 * spreadsheet's whole-row-at-a-glance feel without leaving the app.
 */
function CardYearDrawer({ card, fyStartYear, monthRows, onClose }: {
  card: CcCardRow; fyStartYear: number; monthRows: CcMonthRow[]; onClose: () => void;
}) {
  const cols = React.useMemo(() => fyMonthCols(fyStartYear), [fyStartYear]);
  const [recs, setRecs] = React.useState<Record<number, MonthRec>>(() => {
    const m: Record<number, MonthRec> = {};
    for (const r of monthRows) m[r.month] = recFrom(r);
    return m;
  });
  const [rowBusy, setRowBusy] = React.useState<number | null>(null);
  const [, startTransition] = React.useTransition();

  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; });
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); } };
    document.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey, true); };
  }, []);

  function commit(monthNum: number, next: MonthRec) {
    setRowBusy(monthNum);
    startTransition(async () => {
      const res = await saveCcMonth({ cardId: card.id, month: monthNum, ...next });
      setRowBusy(null);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }
  function setField(monthNum: number, field: keyof MonthRec, value: string, persist: boolean) {
    setRecs((prev) => {
      const cur = prev[monthNum] ?? emptyRec();
      const next = { ...cur, [field]: value };
      if (persist) commit(monthNum, next);
      return { ...prev, [monthNum]: next };
    });
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 max-md:items-end max-md:p-0" role="dialog" aria-modal="true" aria-label={`${card.cardName} — full year`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.44)] backdrop-blur-[2px]" />
      <div className="relative flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl bg-surface-card max-md:max-w-none max-md:rounded-b-none" style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 32px 90px -24px rgba(15,23,42,0.55)" }}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--color-altus-red)" }} />
        <div className="flex shrink-0 items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-altus-red">{fyLabel(fyStartYear)} · Full year</p>
            <h2 className="truncate text-[18px] font-black tracking-[-0.01em] text-ink-strong">{card.code ? `#${card.code} · ` : ""}{card.cardName}</h2>
            <p className="text-[12.5px] font-semibold text-ink-subtle">{[card.entityName, card.ecs && `ECS: ${card.ecs}`, card.stmtPeriod, card.dueDay && `Due ${card.dueDay}`].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 980 }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <Th>Month</Th><Th>Hard copy</Th><Th>G-Drive</Th><Th>Tally</Th><Th>Balance</Th>
                <Th>Paid date</Th><Th>Paid amt</Th><Th>Int+Fin</Th><Th>Chg rev?</Th><Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {cols.map((col) => {
                const rec = recs[col.month] ?? emptyRec();
                const rb = rowBusy === col.month;
                return (
                  <tr key={col.month} className="hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td><span className="font-bold text-ink-strong whitespace-nowrap">{col.label} &apos;{String(col.calYear % 100).padStart(2, "0")}</span></Td>
                    <CellTd><CellSelect value={rec.hardCopy} options={CC_YESNO} busy={rb} onChange={(v) => setField(col.month, "hardCopy", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.googleDrive} options={CC_YESNO} busy={rb} onChange={(v) => setField(col.month, "googleDrive", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.tallyEntry} options={CC_TALLY} busy={rb} onChange={(v) => setField(col.month, "tallyEntry", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.balanceTally} options={CC_BALANCE} busy={rb} onChange={(v) => setField(col.month, "balanceTally", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.ccPaidDate} busy={rb} placeholder="date" onChange={(v) => setField(col.month, "ccPaidDate", v, false)} onCommit={(v) => setField(col.month, "ccPaidDate", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.ccPaidAmt} busy={rb} placeholder="₹" onChange={(v) => setField(col.month, "ccPaidAmt", v, false)} onCommit={(v) => setField(col.month, "ccPaidAmt", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.intFinChgs} busy={rb} placeholder="0" onChange={(v) => setField(col.month, "intFinChgs", v, false)} onCommit={(v) => setField(col.month, "intFinChgs", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.chgReversed} options={CC_YESNO} busy={rb} onChange={(v) => setField(col.month, "chgReversed", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.notes} busy={rb} placeholder="notes" wide onChange={(v) => setField(col.month, "notes", v, false)} onCommit={(v) => setField(col.month, "notes", v, true)} /></CellTd>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CellText({ value, onChange, onCommit, busy, placeholder, wide }: {
  value: string; onChange: (v: string) => void; onCommit: (v: string) => void; busy: boolean; placeholder?: string; wide?: boolean;
}) {
  return (
    <input
      value={value}
      disabled={busy}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      className={CELL_INPUT + " disabled:opacity-60"}
      style={{ minWidth: wide ? 130 : 78 }}
      aria-label={placeholder}
    />
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)" }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-3 align-middle text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}
function CellTd({ children }: { children: React.ReactNode }) {
  return <td className="px-1.5 py-2 align-middle">{children}</td>;
}

function RowActions({ onEdit, onDelete, onMoveUp, onMoveDown, canReorder, isFirst, isLast, busy }: {
  onEdit: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  canReorder: boolean; isFirst: boolean; isLast: boolean; busy: boolean;
}) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => { if (!confirming) return; const t = setTimeout(() => setConfirming(false), 3500); return () => clearTimeout(t); }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      {canReorder && (
        <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={onMoveUp} disabled={busy || isFirst} aria-label="Move up" className="inline-flex size-4 items-center justify-center text-ink-subtle transition-colors hover:text-altus-red disabled:opacity-25">
            <ArrowUp size={13} strokeWidth={2.6} />
          </button>
          <button type="button" onClick={onMoveDown} disabled={busy || isLast} aria-label="Move down" className="inline-flex size-4 items-center justify-center text-ink-subtle transition-colors hover:text-altus-red disabled:opacity-25">
            <ArrowDown size={13} strokeWidth={2.6} />
          </button>
        </div>
      )}
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit card" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50">
        <Pencil size={15} strokeWidth={2.2} />
      </button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete card" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50">
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function CardEditorRow({ colSpan, draft, setDraft, entityOptions, onSave, onCancel, busy, adding }: {
  colSpan: number; draft: CardDraft; setDraft: React.Dispatch<React.SetStateAction<CardDraft>>;
  entityOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean;
}) {
  const set = (patch: Partial<CardDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const YES_NO = ["Yes", "No", "Don't Know"];
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-6 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1">
            <input value={draft.code} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus />
          </Field>
          <Field label="Entity" className="col-span-4 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="entity" kind="cc_entity" options={entityOptions} value={draft.entityName} onChange={(v) => set({ entityName: v })} placeholder="Entity…" />
          </Field>
          <Field label="Card name" className="col-span-6 max-lg:col-span-6 max-md:col-span-2">
            <input value={draft.cardName} onChange={(e) => set({ cardName: e.target.value })} className={INPUT} placeholder="e.g. Amex 33001" aria-label="Card name" />
          </Field>
          <Field label="ECS" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <select value={draft.ecs ?? ""} onChange={(e) => set({ ecs: e.target.value || null })} className={INPUT} aria-label="ECS">
              <option value="">—</option>
              {YES_NO.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
          </Field>
          <Field label="ECS from" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <input value={draft.ecsFrom ?? ""} onChange={(e) => set({ ecsFrom: e.target.value })} className={INPUT} placeholder="Entity" aria-label="ECS from" />
          </Field>
          <Field label="Statement period" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <input value={draft.stmtPeriod} onChange={(e) => set({ stmtPeriod: e.target.value })} className={INPUT} placeholder="15th - 14th" aria-label="Statement period" />
          </Field>
          <Field label="St Dt" className="col-span-1 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.stmtStartDay} onChange={(e) => set({ stmtStartDay: e.target.value })} className={INPUT} placeholder="14" aria-label="St Dt" />
          </Field>
          <Field label="Due Dt" className="col-span-1 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.dueDay} onChange={(e) => set({ dueDay: e.target.value })} className={INPUT} placeholder="1" aria-label="Due Dt" />
          </Field>
          <Field label="Soft copy auto-email" className="col-span-4 max-lg:col-span-6 max-md:col-span-2">
            <select value={draft.softCopyAutoEmail ?? ""} onChange={(e) => set({ softCopyAutoEmail: e.target.value || null })} className={INPUT} aria-label="Soft copy auto-email">
              <option value="">—</option>
              {["Yes", "No", "NA"].map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50">
            <X size={16} strokeWidth={2.4} /> Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Card" : "Save Changes"}
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
