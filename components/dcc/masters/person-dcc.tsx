"use client";

import * as React from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { addDccItem, deleteDccItem } from "@/app/(app)/dcc/actions";

/**
 * ONE PERSON'S WHOLE DCC (DCC-SPEC §4) — in three groups, in this order:
 *
 *   1. FROM THEIR POSITION — the master's rows. Read-only here and badged;
 *      they change only through the DCC Master, or every holder quietly drifts
 *      from the seat.
 *   2. GIVEN TO THEM — rows somebody else authored for them by name.
 *   3. THEIR OWN — rows they added themselves.
 *
 * ── WHY THE AUTHOR IS ON EVERY ROW ─────────────────────────────────────────
 * The delete rule (§5) turns on who authored a row: a compliance Manan Vasa
 * gave is his alone to remove. Showing the author makes that refusal legible
 * BEFORE somebody tries, instead of an error message that reads as a bug.
 */

export interface PersonDccRow {
  id: string;
  title: string;
  section: string | null;
  code: string | null;
  frequency: string | null;
  targetNumber: string | null;
  unit: string | null;
  /** Non-null when it came from a position master — read-only here. */
  masterDesignation: string | null;
  authorName: string | null;
  /** True when this viewer is refused its delete (Manan's guardrail). */
  deleteLocked: boolean;
}

export function PersonDcc({
  personId,
  personName,
  rows,
  canEdit,
}: {
  personId: string;
  personName: string;
  rows: PersonDccRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = React.useState(false);
  const [busy, startWork] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const fromPosition = rows.filter((r) => r.masterDesignation);
  const own = rows.filter((r) => !r.masterDesignation && r.authorName === personName);
  const given = rows.filter((r) => !r.masterDesignation && r.authorName !== personName);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startWork(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else setAdding(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {canEdit && (
        <div>
          {adding ? (
            <AddForm
              busy={busy}
              onCancel={() => setAdding(false)}
              onSave={(d) => run(() => addDccItem({ ownerEmployeeId: personId, ...d }))}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--color-altus-red)" }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add a compliance for {personName}
            </button>
          )}
        </div>
      )}

      <Group
        title="From their position"
        blurb="The position's DCC Master owns these. Change them there and every holder changes with them."
        rows={fromPosition}
        readOnly
        busy={busy}
        onDelete={() => undefined}
      />
      <Group
        title="Given to them"
        blurb="Added for this person by somebody else."
        rows={given}
        readOnly={!canEdit}
        busy={busy}
        onDelete={(id) => run(() => deleteDccItem(id))}
      />
      <Group
        title="Their own"
        blurb="Added by this person."
        rows={own}
        readOnly={!canEdit}
        busy={busy}
        onDelete={(id) => run(() => deleteDccItem(id))}
      />
    </div>
  );
}

function Group({
  title,
  blurb,
  rows,
  readOnly,
  busy,
  onDelete,
}: {
  title: string;
  blurb: string;
  rows: PersonDccRow[];
  readOnly: boolean;
  busy: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-2.5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {title} <span className="ml-1 tabular-nums text-slate-400">{rows.length}</span>
        </h3>
        <p className="mt-0.5 text-[11.5px] text-ink-subtle">{blurb}</p>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-ink-muted">Nothing here.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink-strong">
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
                  {r.masterDesignation && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">
                      From the {r.masterDesignation} master
                    </span>
                  )}
                  {r.authorName && !r.masterDesignation && (
                    <span className="text-slate-400">Added by {r.authorName}</span>
                  )}
                </p>
              </div>
              {!readOnly &&
                (r.deleteLocked ? (
                  <span
                    title="Manan Sir gave this compliance. Only he can remove it."
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 text-[12px] font-semibold text-slate-500"
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden /> Protected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(r.id)}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface AddDraft {
  title: string;
  section: string;
  code: string;
  frequency: string;
  targetNumber: string;
  unit: string;
}

function AddForm({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: (d: AddDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = React.useState<AddDraft>({
    title: "",
    section: "",
    code: "",
    frequency: "Daily",
    targetNumber: "",
    unit: "",
  });
  const set = (k: keyof AddDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
        <label className="col-span-2 block max-md:col-span-1">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Title <span className="text-red-500">*</span>
          </span>
          <input
            required
            autoFocus
            value={d.title}
            onChange={set("title")}
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
          />
        </label>
        {(
          [
            ["section", "Section", "Start of day"],
            ["code", "Code", "ME-01"],
            ["frequency", "Frequency", "Daily · Mon, Wed, Fri"],
            ["targetNumber", "Target", "12"],
            ["unit", "Unit", "calls"],
          ] as const
        ).map(([k, label, placeholder]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {label}
            </span>
            <input
              value={d[k]}
              onChange={set(k)}
              placeholder={placeholder}
              className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px]"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !d.title.trim()}
          className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          Add compliance
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
