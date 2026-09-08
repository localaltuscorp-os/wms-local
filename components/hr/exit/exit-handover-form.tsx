"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { useAutosave } from "@/components/hr/forms/use-autosave";
import { SaveIndicator } from "@/components/hr/forms/save-indicator";
import { saveExitRecord } from "@/app/(app)/hr/exit/exit-actions";
import { CLEARANCE_ROWS, HANDOVER_INSTRUCTIONS, HANDOVER_NOTES_LABEL } from "@/lib/hr/exit/content";
import { FloatingInput, FloatingTextarea, CheckRow, LabelValueGrid, EmployeeCombobox, AutoFillField } from "./exit-fields";
import { validateExitSubmission } from "@/lib/hr/exit/validate";
import { focusField, type PersistOutcome } from "./persist-outcome";
import type { ExitRosterEmployee } from "@/lib/hr/exit/schema";

type Fields = Record<string, string>;
type Checked = Record<string, boolean>;

interface InitialData {
  fields?: Fields;
  checked?: Checked;
}

export function ExitHandoverForm({
  employeeId,
  employeeName,
  roster = [],
  onEmployeeChange,
  recordId,
  initial,
  initialStatus = "draft",
  onBack,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  /** Full roster powering the searchable Employee dropdown + auto-fill. */
  roster?: ExitRosterEmployee[];
  /** Switch the record to another employee (workspace re-loads their form). */
  onEmployeeChange?: (id: string) => void;
  recordId: string | null;
  initial?: InitialData;
  /** Whether this checklist was already SUBMITTED, read from the submissions
   *  index by `getExitRecord`. */
  initialStatus?: "draft" | "submitted";
  onBack: () => void;
  onSaved?: (id: string) => void;
}) {
  const rosterEmp = roster.find((e) => e.id === employeeId) ?? null;
  const [fields, setFields] = React.useState<Fields>(() => {
    const seeded: Fields = { ...(initial?.fields ?? {}) };
    seeded.header_employeeName = seeded.header_employeeName || employeeName;
    // Auto-fill Employee ID + Department from the roster only when not already saved.
    if (!seeded.header_employeeId) seeded.header_employeeId = rosterEmp?.employeeCode ?? rosterEmp?.id ?? "";
    if (!seeded.header_department) seeded.header_department = rosterEmp?.department ?? "";
    return seeded;
  });
  const [checked, setChecked] = React.useState<Checked>(() => initial?.checked ?? {});
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(initialStatus === "submitted");
  const idRef = React.useRef<string | null>(recordId);
  const stateRef = React.useRef({ fields, checked });
  stateRef.current = { fields, checked };

  const setF = React.useCallback((k: string, v: string) => {
    setFields((p) => ({ ...p, [k]: v }));
  }, []);
  const toggle = React.useCallback((id: string) => {
    setChecked((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  /**
   * `silent` suppresses only the SUCCESS toast (autosave shouldn't chatter).
   * Errors are always reported — a save that failed is never a quiet event.
   */
  const persist = React.useCallback(
    async (silent: boolean, status: "draft" | "submitted" = "draft"): Promise<PersistOutcome> => {
      const s = stateRef.current;
      const res = await saveExitRecord({
        id: idRef.current ?? undefined,
        employeeId,
        kind: "handover",
        data: { fields: s.fields, checked: s.checked },
        // Previously omitted, so this defaulted to "draft" on EVERY save. The
        // checklist is a registered form, so the effect was that it could
        // never be submitted at all: it never left Drafts, never appeared in
        // My Filled Forms, and never mailed its clearance PDF to HR.
        status,
      });
      if (res.ok) {
        idRef.current = res.id;

        // A submit fires its own, more specific confirmation.
        if (!silent && status !== "submitted") fireToast({ message: "Handover checklist saved." });
        onSaved?.(res.id);
        return "ok";
      }
      if (!silent) fireToast({ message: res.error, type: "error" });
      return "failed";
    },
    [employeeId, onSaved],
  );

  /**
   * ONE autosave, shared with every other HR form. Replaces a bespoke 1400ms
   * interval that polled a hand-maintained dirty flag, never retried a failed
   * write and never told anyone it had failed.
   */
  const autosave = useAutosave({
    data: { fields, checked },
    save: async () => {
      const outcome = await persist(true);
      return outcome === "ok" ? { ok: true } : { ok: false, error: "Could not save." };
    },
  });

  async function onSaveClick() {
    setSaving(true);
    try {
      // Through the hook, not around it: flush() waits out an in-flight autosave
      // and writes the LATEST state, so the button and the autosave are never two
      // competing writers of the same row.
      const ok = await autosave.flush();
      if (ok) fireToast({ message: "Draft saved." });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Submit — files the checklist so it leaves Drafts, lands in My Filled Forms
   * and mails the clearance PDF to the HR desk. Mirrors the exit interview's
   * submit exactly, including waiting out an in-flight autosave rather than
   * silently doing nothing.
   */
  async function onSubmitClick() {
    const check = validateExitSubmission("handover", stateRef.current);
    if (!check.ok) {
      fireToast({ message: check.error, type: "error" });
      focusField(check.missing[0]);
      return;
    }

    setSubmitting(true);
    try {
      // Land any pending autosave FIRST, then submit once. The old retry budget
      // existed only to out-wait an autosave that could hold the lock; flush()
      // now does that deterministically, so Submit can no longer no-op.
      await autosave.flush();
      const outcome = await persist(false, "submitted");
      if (outcome === "ok") {
        setSubmitted(true);
        fireToast({ message: "Handover checklist submitted." });
      }
      // "failed" already toasted the server's own reason inside persist.
    } finally {
      setSubmitting(false);
    }
  }

  const totalItems = CLEARANCE_ROWS.reduce((n, r) => n + r.items.length, 0);
  const doneItems = CLEARANCE_ROWS.reduce((n, r) => n + r.items.filter((it) => checked[it.id]).length, 0);

  return (
    <div className="ex-step mx-auto w-full max-w-[960px] px-6 pb-40 pt-8 max-md:px-4">
      <div className="mb-6">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-muted">Annexure A</span>
        <h1
          className="mt-1 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.01em" }}
        >
          Handover &amp; Clearance Checklist
        </h1>
        <p
          className="mt-3 rounded-xl px-4 py-3 text-[13.5px] leading-relaxed text-ink-strong"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 5%, #fff)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, #fff)",
          }}
        >
          <strong style={{ color: "var(--color-altus-red-deep)" }}>Instructions:</strong> {HANDOVER_INSTRUCTIONS}
        </p>
      </div>

      {/* identity recap — aligned label → value grid */}
      <div className="mb-6 rounded-2xl border border-hairline bg-white px-5 py-4 max-md:px-4">
        <LabelValueGrid
          rows={[
            { label: "Employee", value: fields.header_employeeName || employeeName },
            { label: "Employee ID", value: fields.header_employeeId },
            { label: "Department", value: fields.header_department },
            { label: "Form", value: "Handover & Clearance · Annexure A" },
          ]}
        />
      </div>

      {/* header fields — searchable employee dropdown auto-fills Employee ID + Department */}
      <div className="mb-4">
        <EmployeeCombobox
          label="Employee Name"
          roster={roster}
          value={employeeId}
          onChange={(id) => onEmployeeChange?.(id)}
          autoFocus
        />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <AutoFillField label="Employee ID" value={fields.header_employeeId ?? ""} onChange={(v) => setF("header_employeeId", v)} />
        <AutoFillField label="Department" value={fields.header_department ?? ""} onChange={(v) => setF("header_department", v)} />
        <FloatingInput label="Last Working Day" type="date" fieldKey="header_lastWorkingDay" value={fields.header_lastWorkingDay ?? ""} onChange={(v) => setF("header_lastWorkingDay", v)} />
      </div>

      {/* progress */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${totalItems ? Math.round((doneItems / totalItems) * 100) : 0}%`,
              background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
              transition: "width .4s cubic-bezier(.22,1,.36,1)",
            }}
          />
        </div>
        <span className="text-[12.5px] font-bold tabular-nums text-ink-muted">
          {doneItems}/{totalItems} cleared
        </span>
      </div>

      {/* clearance rows */}
      <div className="flex flex-col gap-4">
        {CLEARANCE_ROWS.map((row) => {
          const rowDone = row.items.every((it) => checked[it.id]);
          return (
            <section key={row.id} className="overflow-hidden rounded-2xl border border-hairline bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5 max-md:px-4" style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, #fff)" }}>
                <h3 className="text-[15px] font-extrabold text-ink-strong">{row.department}</h3>
                <span
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                  style={
                    rowDone
                      ? { background: "color-mix(in srgb, #16a34a 14%, #fff)", color: "#15803d" }
                      : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }
                  }
                >
                  {rowDone && <Check size={12} strokeWidth={3} />}
                  {row.items.filter((it) => checked[it.id]).length}/{row.items.length}
                </span>
              </div>
              <div className="grid gap-2.5 p-5 max-md:p-4">
                <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
                  {row.items.map((it) => (
                    <CheckRow key={it.id} label={it.label} checked={Boolean(checked[it.id])} onToggle={() => toggle(it.id)} />
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <FloatingInput
                    label="Sign-off (name)"
                    value={fields[`signoff_${row.id}_name`] ?? ""}
                    onChange={(v) => setF(`signoff_${row.id}_name`, v)}
                  />
                  <FloatingInput
                    label="Date"
                    type="date"
                    value={fields[`signoff_${row.id}_date`] ?? ""}
                    onChange={(v) => setF(`signoff_${row.id}_date`, v)}
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* clearance notes */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-white p-5 max-md:p-4">
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-muted">Notes</h3>
        <FloatingTextarea
          label={HANDOVER_NOTES_LABEL}
          value={fields.notes ?? ""}
          onChange={(v) => setF("notes", v)}
          rows={3}
        />
      </section>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-white/95 px-6 py-3.5 backdrop-blur max-md:px-4">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-ink-soft"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="flex items-center gap-3">
            {/* Reports what the SERVER confirmed: "Submitted" only appears once
                the submit write came back ok. */}
            {submitted ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "#16a34a" }}>
                <Check size={13} strokeWidth={3} /> Submitted
              </span>
            ) : (
              <SaveIndicator
                state={autosave.state}
                savedAt={autosave.savedAt}
                error={autosave.error}
              />
            )}
            <button
              onClick={onSaveClick}
              disabled={saving || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-5 py-2.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saving ? "Saving…" : "Save checklist"}
            </button>
            {/* Already submitted: the checklist is filed and HR has been mailed.
                Edits still save — the server keeps a submitted form submitted. */}
            <button
              onClick={onSubmitClick}
              disabled={saving || submitting || submitted}
              title={submitted ? "This checklist has already been submitted." : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
