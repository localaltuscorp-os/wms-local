"use client";

import * as React from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { addDccItem, deleteDccItem, updateDccItem } from "@/app/(app)/dcc/actions";
import { scheduleOf } from "@/lib/dcc/frequency";
import {
  ComplianceForm,
  emptyDraft,
  type ComplianceDraft,
} from "@/components/dcc/compliance-form";

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
 *
 * EDIT AND DELETE ARE GATED IDENTICALLY, in the server action — an edit free to
 * rename a row to anything would otherwise be a way around the delete rule.
 */

export interface PersonDccRow {
  id: string;
  title: string;
  section: string | null;
  code: string | null;
  frequency: string | null;
  /** The mask the board actually obeys — what the edit form opens on. */
  weekdays: number | null;
  targetNumber: string | null;
  unit: string | null;
  /** Non-null when it came from a position master — read-only here. */
  masterDesignation: string | null;
  authorName: string | null;
  /** True when this viewer is refused its delete (Manan's guardrail). */
  deleteLocked: boolean;
}

function draftOf(r: PersonDccRow): ComplianceDraft {
  return {
    title: r.title,
    section: r.section ?? "",
    code: r.code ?? "",
    schedule: scheduleOf({ frequency: r.frequency, weekdays: r.weekdays }),
    targetNumber: r.targetNumber ?? "",
    unit: r.unit ?? "",
  };
}

export function PersonDcc({
  personId,
  personName,
  rows,
  canEdit,
  today,
}: {
  personId: string;
  personName: string;
  rows: PersonDccRow[];
  canEdit: boolean;
  today: string;
}) {
  /* One editor open at a time: `"new"`, a row id, or nothing. Two open forms on
     one screen is two drafts and no way to tell which Save belongs to which. */
  const [open, setOpen] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ComplianceDraft>(emptyDraft);
  const [busy, startWork] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const fromPosition = rows.filter((r) => r.masterDesignation);
  const own = rows.filter((r) => !r.masterDesignation && r.authorName === personName);
  const given = rows.filter((r) => !r.masterDesignation && r.authorName !== personName);

  function begin(id: string | null, d: ComplianceDraft) {
    setError(null);
    setDraft(d);
    setOpen(id);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startWork(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else setOpen(null);
    });
  }

  const payload = () => ({
    title: draft.title,
    section: draft.section,
    code: draft.code,
    schedule: draft.schedule,
    targetNumber: draft.targetNumber,
    unit: draft.unit,
  });

  const editor = (id: string, label: string) =>
    open === id ? (
      <ComplianceForm
        draft={draft}
        onChange={setDraft}
        busy={busy}
        error={error}
        today={today}
        submitLabel={label}
        onCancel={() => setOpen(null)}
        onSubmit={() =>
          run(() =>
            id === "new"
              ? addDccItem({ ownerEmployeeId: personId, ...payload() })
              : updateDccItem({ itemId: id, ...payload() }),
          )
        }
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {error && open === null && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {canEdit && (
        <div>
          {open === "new" ? (
            editor("new", "Add compliance")
          ) : (
            <button
              type="button"
              onClick={() => begin("new", emptyDraft())}
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
        openId={open}
        editor={editor}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />
      <Group
        title="Given to them"
        blurb="Added for this person by somebody else."
        rows={given}
        readOnly={!canEdit}
        busy={busy}
        openId={open}
        editor={editor}
        onEdit={(r) => begin(r.id, draftOf(r))}
        onDelete={(id) => run(() => deleteDccItem(id))}
      />
      <Group
        title="Their own"
        blurb="Added by this person."
        rows={own}
        readOnly={!canEdit}
        busy={busy}
        openId={open}
        editor={editor}
        onEdit={(r) => begin(r.id, draftOf(r))}
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
  openId,
  editor,
  onEdit,
  onDelete,
}: {
  title: string;
  blurb: string;
  rows: PersonDccRow[];
  readOnly: boolean;
  busy: boolean;
  openId: string | null;
  editor: (id: string, label: string) => React.ReactNode;
  onEdit: (r: PersonDccRow) => void;
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
            <li key={r.id} className="border-b border-slate-100 last:border-b-0">
              {/* The editor opens IN PLACE of its row, so there is never any
                  doubt about which compliance is being changed. */}
              {openId === r.id ? (
                <div className="p-3">{editor(r.id, "Save changes")}</div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
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
                        title="Manan Sir gave this compliance. Only he can change or remove it."
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 text-[12px] font-semibold text-slate-500"
                      >
                        <Lock className="h-3.5 w-3.5" aria-hidden /> Protected
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onEdit(r)}
                          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onDelete(r.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
