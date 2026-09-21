"use client";

import * as React from "react";
import { Loader2, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import type { DccMasterItemRow, MasterDesignationRow } from "@/lib/queries/dcc-masters";
import {
  reconcileNow,
  restoreDccMasterItem,
  retireDccMasterItem,
  saveDccMasterItem,
} from "@/app/(app)/dcc/masters/actions";

/**
 * THE POSITION'S DCC MASTER (DCC-SPEC §3) — the template a seat carries.
 *
 * Mirrors Master JD: pick a position on the left, edit its rows on the right,
 * and every holder's board changes with it. The holder list is shown beside the
 * position on purpose — "who am I about to give this to" is the question an
 * author should not have to leave the screen to answer.
 *
 * ── WHY EDITING IS A ROW-LEVEL FORM AND NOT A MODAL ────────────────────────
 * A template is built by comparing rows: this one is daily, that one weekly,
 * this code follows that one. A modal hides the list you are comparing against,
 * so the row expands in place instead.
 */

export interface PositionMasterProps {
  designations: MasterDesignationRow[];
  items: DccMasterItemRow[];
  /** Migration 0230 not applied — everything is read-only and says so. */
  missing: boolean;
  canEdit: boolean;
}

type Draft = {
  id?: string;
  title: string;
  section: string;
  code: string;
  frequency: string;
  targetNumber: string;
  unit: string;
  sortOrder: string;
};

const blank = (): Draft => ({
  id: undefined,
  title: "",
  section: "",
  code: "",
  frequency: "Daily",
  targetNumber: "",
  unit: "",
  sortOrder: "100",
});

const fromRow = (r: DccMasterItemRow): Draft => ({
  id: r.id,
  title: r.title,
  section: r.section ?? "",
  code: r.code ?? "",
  frequency: r.frequency ?? "",
  targetNumber: r.targetNumber ?? "",
  unit: r.unit ?? "",
  sortOrder: String(r.sortOrder),
});

export function PositionMaster({ designations, items, missing, canEdit }: PositionMasterProps) {
  const [picked, setPicked] = React.useState<string | null>(designations[0]?.id ?? null);
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const [busy, startWork] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const position = designations.find((d) => d.id === picked) ?? null;
  const rows = items
    .filter((i) => i.designationId === picked)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  function run(fn: () => Promise<{ ok: boolean; error?: string; changed?: number }>) {
    setError(null);
    setNote(null);
    startWork(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "That didn't work.");
        return;
      }
      setEditing(null);
      if (typeof res.changed === "number") {
        setNote(
          res.changed === 0
            ? "Everyone was already up to date."
            : `${res.changed} compliance${res.changed === 1 ? "" : "s"} updated across the holders.`,
        );
      }
    });
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4 max-lg:grid-cols-1">
      {/* ── The positions ─────────────────────────────────────────────── */}
      <nav aria-label="Positions" className="rounded-2xl border border-slate-200 bg-white p-2">
        <ul className="max-h-[70vh] overflow-y-auto">
          {designations.map((d) => {
            const on = d.id === picked;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(d.id);
                    setEditing(null);
                  }}
                  aria-current={on ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                    on ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 text-[11px] tabular-nums ${
                      on ? "bg-white/20" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {d.activeKpis}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── The template ──────────────────────────────────────────────── */}
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="mr-auto min-w-0">
            <h2 className="text-[15px] font-bold text-ink-strong">
              {position?.name ?? "Pick a position"}
            </h2>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {position
                ? position.holders.length === 0
                  ? "Nobody holds this position yet"
                  : `${position.holders.length} holder${position.holders.length === 1 ? "" : "s"}: ${position.holders
                      .map((h) => h.name)
                      .slice(0, 4)
                      .join(", ")}${position.holders.length > 4 ? "…" : ""}`
                : "Its compliances land on everyone holding the seat."}
            </p>
          </div>
          {canEdit && !missing && position && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => reconcileNow())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Apply to everyone
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(blank())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--color-altus-red)" }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add compliance
              </button>
            </>
          )}
        </header>

        {error && (
          <p role="alert" className="border-b border-slate-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
            {error}
          </p>
        )}
        {note && (
          <p className="border-b border-slate-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
            {note}
          </p>
        )}

        {editing && position && (
          <RowForm
            draft={editing}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(d) =>
              run(() =>
                saveDccMasterItem({
                  id: d.id,
                  designationId: position.id,
                  title: d.title,
                  section: d.section || null,
                  code: d.code || null,
                  frequency: d.frequency || null,
                  targetNumber: d.targetNumber || null,
                  unit: d.unit || null,
                  sortOrder: Number(d.sortOrder) || 100,
                }),
              )
            }
          />
        )}

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-muted">
            This position carries no compliances yet.
          </p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 ${
                  r.isActive ? "" : "bg-slate-50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[13.5px] font-semibold ${
                      r.isActive ? "text-ink-strong" : "text-slate-400 line-through"
                    }`}
                  >
                    {r.code && (
                      <span className="mr-2 font-mono text-[11.5px] text-slate-400">{r.code}</span>
                    )}
                    {r.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-2 text-[11.5px] text-ink-subtle">
                    {r.section && <span>{r.section}</span>}
                    <span>{r.frequency || "No frequency"}</span>
                    {r.targetNumber && (
                      <span className="tabular-nums">
                        Target {r.targetNumber}
                        {r.unit ? ` ${r.unit}` : ""}
                      </span>
                    )}
                    {!r.isActive && <span className="font-semibold text-slate-400">Retired</span>}
                  </p>
                </div>
                {canEdit && !missing && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing(fromRow(r))}
                      className="h-7 rounded-md px-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    {r.isActive ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => retireDccMasterItem(r.id))}
                        title="Retire — holders' copies are archived, their history is kept"
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Retire
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => restoreDccMasterItem(r.id))}
                        className="h-7 rounded-md px-2 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <p className="flex items-center gap-2 border-t border-slate-200 px-4 py-2 text-[12px] text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Applying to every holder…
          </p>
        )}
      </section>
    </div>
  );
}

function RowForm({
  draft,
  busy,
  onSave,
  onCancel,
}: {
  draft: Draft;
  busy: boolean;
  onSave: (d: Draft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = React.useState(draft);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
      className="border-b border-slate-200 bg-slate-50 px-4 py-3"
    >
      <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2">
        <Field label="Title" className="col-span-2" required>
          <input
            required
            autoFocus
            value={d.title}
            onChange={set("title")}
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
          />
        </Field>
        <Field label="Section">
          <input
            value={d.section}
            onChange={set("section")}
            placeholder="Start of day"
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
          />
        </Field>
        <Field label="Code">
          <input
            value={d.code}
            onChange={set("code")}
            placeholder="EX-01"
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
          />
        </Field>
        <Field label="Frequency" hint="Daily · Mon, Wed, Fri · Weekly">
          <input
            value={d.frequency}
            onChange={set("frequency")}
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
          />
        </Field>
        <Field label="Target">
          <input
            value={d.targetNumber}
            onChange={set("targetNumber")}
            placeholder="12"
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-right text-[13px] tabular-nums"
          />
        </Field>
        <Field label="Unit">
          <input
            value={d.unit}
            onChange={set("unit")}
            placeholder="calls"
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
          />
        </Field>
        <Field label="Sort">
          <input
            value={d.sortOrder}
            onChange={set("sortOrder")}
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-right text-[13px] tabular-nums"
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !d.title.trim()}
          className="inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {d.id ? "Save and apply" : "Add and apply"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <span className="text-[11.5px] text-ink-subtle">
          Saving updates every holder&apos;s board.
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-[10.5px] text-slate-400">{hint}</span>}
    </label>
  );
}
