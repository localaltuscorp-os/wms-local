"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, ArrowRight, Sparkles, Search, X, UserPlus } from "lucide-react";
import type { RosterMember } from "@/components/goals/cascade/util";

/**
 * Goals Bulk-entry GRID — an in-app spreadsheet. The user fills typed boxes +
 * dropdowns (no download/upload), can add delegate members per row via a
 * type-to-search picker, pastes straight from Excel if they like, then
 * "Proceed" hands clean rows to the duplicate/anomaly review step.
 * Keyboard-first: Tab across cells; dropdowns are native <select> for Excel feel.
 */

export interface BulkGridRow {
  area: string | null;
  title: string;
  uom: string | null;
  actual: string | null;
  target: string | null;
  category: string | null;
  delegatedTo: { employeeId: string; name: string; pct: number }[];
}

interface Person {
  id: string;
  name: string;
}

/** A delegate carries its OWN accountability weight (%), edited per-member —
 *  same as the main Goals table's Delegated cell (not just an even auto-split). */
interface Delegate {
  id: string;
  name: string;
  pct: number;
}

interface Draft {
  id: number;
  area: string;
  title: string;
  uom: string;
  actual: string;
  target: string;
  category: string;
  delegates: Delegate[];
}

let _seq = 1;
const blank = (): Draft => ({ id: _seq++, area: "", title: "", uom: "", actual: "", target: "", category: "", delegates: [] });

type CellKey = "area" | "title" | "uom" | "actual" | "target" | "category";
/** Columns in order (matches the xlsx template: Area·Goal·Measure·Actual·Target·Type). */
const COLS: { key: CellKey; label: string; kind: "select-area" | "select-measure" | "select-type" | "text" | "num"; minW: number }[] = [
  { key: "area", label: "Area", kind: "select-area", minW: 110 },
  { key: "title", label: "Goal Title", kind: "text", minW: 300 },
  { key: "uom", label: "Measure", kind: "select-measure", minW: 100 },
  { key: "actual", label: "Actual", kind: "num", minW: 78 },
  { key: "target", label: "Target", kind: "num", minW: 78 },
  { key: "category", label: "Type", kind: "select-type", minW: 120 },
];

const CELL =
  "w-full bg-transparent px-2 py-1.5 text-[13px] text-ink-strong outline-none focus:bg-[color-mix(in_oklab,var(--color-altus-red)_5%,transparent)]";

/** Even-split the 100% across `n` members (last one absorbs the rounding). */
function evenSplit(n: number): number[] {
  if (n <= 0) return [];
  const each = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 100 - each * (n - 1) : each));
}

/** Per-row delegate picker — type-to-search the roster; a chip per picked member
 *  with an EDITABLE weight-% input (auto-splits evenly on add, then tweak). */
function DelegatePicker({ roster, value, onChange }: { roster: RosterMember[]; value: Delegate[]; onChange: (v: Delegate[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [box, setBox] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const picked = new Set(value.map((v) => v.id));
  const filtered = roster
    .filter((r) => !picked.has(r.id) && r.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 100); // show the FULL roster (the list is scrollable) — not just the first few

  function openPop() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setBox({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240), width: Math.max(r.width, 220) });
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  }
  function add(m: RosterMember) {
    // Adding re-splits evenly (a clean starting point); each % is then editable.
    const next = [...value, { id: m.id, name: m.name, pct: 0 }];
    const split = evenSplit(next.length);
    onChange(next.map((d, i) => ({ ...d, pct: split[i] ?? 0 })));
    setQ("");
    searchRef.current?.focus();
  }
  function setPct(id: string, raw: string) {
    const n = Math.max(0, Math.min(100, Number(raw.replace(/[^0-9]/g, "")) || 0));
    onChange(value.map((x) => (x.id === id ? { ...x, pct: n } : x)));
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-1.5 py-1">
      {value.map((v) => (
        <span key={v.id} className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-strong" style={{ borderColor: "var(--color-hairline-strong)" }}>
          {v.name.split(" ")[0]}
          <input
            value={String(v.pct)}
            onChange={(e) => setPct(v.id, e.target.value)}
            inputMode="numeric"
            aria-label={`${v.name} weight percent`}
            title="Accountability weight for this member (%)"
            className="w-6 rounded bg-[color-mix(in_oklab,var(--color-altus-red)_7%,transparent)] text-center text-[11px] font-bold tabular-nums text-altus-red-deep outline-none"
          />
          <span className="text-[10px] text-ink-subtle">%</span>
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== v.id))} aria-label={`Remove ${v.name}`} className="ml-0.5 text-ink-subtle hover:text-altus-red">
            <X size={11} />
          </button>
        </span>
      ))}
      <button
        ref={btnRef}
        type="button"
        onClick={openPop}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); openPop(); } }}
        className="inline-flex items-center gap-1 rounded-md border border-solid px-1.5 py-0.5 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
        style={{ borderColor: "var(--color-hairline-strong)" }}
      >
        <UserPlus size={12} strokeWidth={2.4} /> {value.length ? "" : "Delegate"}
      </button>

      {open && box && typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[290]" onClick={() => setOpen(false)} />
            <div
              className="wg-fade-in fixed z-[300] overflow-hidden rounded-xl border bg-surface-card shadow-xl"
              style={{ top: box.top, left: box.left, width: box.width, borderColor: "var(--color-hairline-strong)" }}
            >
              <div className="flex items-center gap-1.5 border-b px-2.5 py-2" style={{ borderColor: "var(--color-hairline)" }}>
                <Search size={13} className="text-ink-subtle" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered[0]) { e.preventDefault(); add(filtered[0]); }
                    else if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="Type a name…"
                  className="w-full bg-transparent text-[13px] text-ink-strong outline-none"
                />
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-[12.5px] font-semibold text-ink-subtle">No matches</p>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => add(m)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      {m.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

export function GoalsBulkGrid(props: {
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  roster: RosterMember[];
  levelName: string;
  onProceed: (rows: BulkGridRow[]) => void;
}) {
  const [rows, setRows] = React.useState<Draft[]>(() => Array.from({ length: 5 }, blank));

  const optionsFor = (kind: string): string[] =>
    kind === "select-area" ? props.areaOptions : kind === "select-measure" ? props.measureOptions : props.typeOptions;

  function setCell(id: number, key: CellKey, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }
  function setDelegates(id: number, delegates: Delegate[]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, delegates } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, blank()]);
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? blank() : r))));
  }

  /** Paste-from-Excel: TSV/CSV in the clipboard becomes rows (7 columns, in order). */
  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;
    e.preventDefault();
    const order: CellKey[] = ["area", "title", "uom", "actual", "target", "category"];
    const parsed: Draft[] = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const cells = line.split("\t");
        const d = blank();
        order.forEach((k, i) => { (d[k] as string) = (cells[i] ?? "").trim(); });
        return d;
      });
    if (parsed.length === 0) return;
    setRows((prev) => {
      const filled = prev.filter((r) => r.title.trim() || r.area.trim());
      return [...filled, ...parsed];
    });
  }

  function proceed() {
    const out: BulkGridRow[] = rows
      .filter((r) => r.title.trim().length > 0)
      .map((r) => {
        return {
          area: r.area.trim() || null,
          title: r.title.trim(),
          uom: r.uom.trim() || null,
          actual: r.actual.trim() || null,
          target: r.target.trim() || null,
          category: r.category.trim() || null,
          // Per-member accountability weight, edited in the Delegate chip.
          delegatedTo: r.delegates.map((d) => ({ employeeId: d.id, name: d.name, pct: d.pct })),
        };
      });
    props.onProceed(out);
  }

  const filledCount = rows.filter((r) => r.title.trim()).length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
        <span className="text-[13px] font-bold text-ink-strong">Fill your {props.levelName.toLowerCase()} goals below</span>
        <span className="text-[12px] font-semibold text-ink-subtle">- type, pick from the dropdowns, delegate, or paste rows from Excel</span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-hairline-strong)" }} onPaste={onPaste}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--color-surface-soft)" }}>
              <th className="w-10 border-b px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>#</th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={`border-b border-l px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft ${c.key === "title" ? "text-left" : "text-center"}`}
                  style={{ borderColor: "var(--color-hairline)", minWidth: c.minW }}
                >
                  {c.label}
                </th>
              ))}
              <th className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 190 }}>Delegated</th>
              <th className="w-8 border-b border-l px-1 py-2" style={{ borderColor: "var(--color-hairline)" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="group">
                <td className="border-b px-1 text-center align-middle text-[12px] font-bold tabular-nums text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>{i + 1}</td>
                {COLS.map((c) => (
                  <td key={c.key} className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: c.minW }}>
                    {c.kind === "text" ? (
                      // Wrapping, auto-growing textarea → the FULL goal is always
                      // visible (no truncation / clutter), matching the main table.
                      <textarea
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, c.key, e.target.value)}
                        onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }}
                        rows={1}
                        placeholder="What does done look like?"
                        className={`${CELL} resize-none overflow-hidden font-semibold leading-snug`}
                      />
                    ) : c.kind === "num" ? (
                      <input
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, c.key, e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className={`${CELL} text-center`}
                      />
                    ) : (
                      <select
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, c.key, e.target.value)}
                        className={`${CELL} cursor-pointer text-center ${r[c.key] ? "text-ink-strong" : "text-ink-subtle"}`}
                      >
                        <option value="">-</option>
                        {optionsFor(c.kind).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    )}
                  </td>
                ))}
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 190 }}>
                  <DelegatePicker roster={props.roster} value={r.delegates} onChange={(v) => setDelegates(r.id, v)} />
                </td>
                <td className="border-b border-l px-1 text-center align-middle" style={{ borderColor: "var(--color-hairline)" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`Remove row ${i + 1}`}
                    className="grid size-6 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:text-altus-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-solid px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <Plus size={14} strokeWidth={2.6} /> Add row
          </button>
        </div>
        <button
          type="button"
          onClick={proceed}
          disabled={filledCount === 0}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          Proceed to review {filledCount > 0 ? `(${filledCount})` : ""} <ArrowRight size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
