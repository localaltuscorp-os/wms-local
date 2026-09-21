"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { EmployeeMasterRow, MasterOptions } from "@/lib/employees/master-query";
import {
  EMPLOYEE_TYPE_OPTIONS,
  WORKER_TYPE_LABELS,
  type WorkerType,
} from "@/lib/attendance/worker-type";
import { bulkEditEmployees } from "@/app/(admin)/admin/employees/actions";

/**
 * BULK EDIT (§17).
 *
 * ── THE ONE PROPERTY THAT MATTERS ──────────────────────────────────────────
 * "If Entity is checked, only Entity changes. If Function is unchecked,
 * existing Functions must remain untouched. Do not overwrite fields with
 * blanks/null simply because they were not selected."
 *
 * That is enforced STRUCTURALLY here, not by care: a field's value is only put
 * into the patch when its checkbox is ticked. An unticked field contributes no
 * key at all, and the server (`bulkEditEmployees` → `editEmployee`) writes only
 * the keys it receives. Absent means "leave alone"; an explicitly chosen "—"
 * means "clear it". Those are different, and keeping them different is what
 * stops a bulk edit of 12 people blanking nine fields on each.
 *
 * The safest possible mistake here is a no-op, and that is deliberate: with
 * nothing ticked the Apply button is disabled and the server would refuse the
 * empty patch anyway.
 *
 * ── CTC IS NOT HERE, ON PURPOSE ────────────────────────────────────────────
 * §17 asks that bulk CTC be explicit — replace a whole breakup, or change one
 * component — and warns against overwriting a salary structure by accident. A
 * single "CTC" box in this dialog is exactly that accident, so it is omitted
 * rather than shipped half-safe. CTC is edited per employee in the workspace,
 * where the component split is visible while you change it.
 */

interface FieldSpec {
  key: keyof Patch;
  label: string;
  kind: "select" | "bool" | "date";
  options?: { id: string; name: string }[];
  /** Shown beneath the control when the field has a consequence beyond itself. */
  warning?: string;
}

interface Patch {
  payingEntityId?: string | null;
  designationId?: string | null;
  /**
   * The field the UI labels SHIFT TYPE — employees.worker_type.
   *
   * It replaced the shift_types picker here for the same reason it did on
   * the table and in the workspace: that picker had no rows and nobody
   * assigned to it, while this is set for every employee. The old
   * functionId field went the same way: migration 0234 moved the department
   * rows into the `functions` table, so the Function is now that record.
   *
   * ⚠ It also decides PAY BASIS (lib/attendance/worker-type.ts), which is
   * why this one field carries a warning: applied in bulk it would move
   * several people between monthly and hourly pay at once.
   */
  workerType?: WorkerType;
  managerId?: string | null;
  isTeamLead?: boolean;
  trainPass?: boolean;
  probationEnd?: string | null;
}

export function BulkEditDialog({
  employees,
  options,
  onClose,
  onDone,
}: {
  employees: EmployeeMasterRow[];
  options: MasterOptions;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState<Set<string>>(new Set());
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const fields: FieldSpec[] = [
    { key: "payingEntityId", label: "Entity", kind: "select", options: options.entities },
    { key: "designationId", label: "Designation", kind: "select", options: options.designations },
    {
      key: "workerType",
      label: "Shift Type",
      kind: "select",
      options: EMPLOYEE_TYPE_OPTIONS.map((w) => ({ id: w, name: WORKER_TYPE_LABELS[w] })),
      warning:
        "Also changes how they are paid — Full Time is a monthly CTC, the rest are hourly.",
    },
    { key: "managerId", label: "Manager", kind: "select", options: options.managers },
    { key: "isTeamLead", label: "Team Lead", kind: "bool" },
    { key: "trainPass", label: "Train Pass", kind: "bool" },
    { key: "probationEnd", label: "Probation Ends On", kind: "date" },
  ];

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(key: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function apply() {
    // THE PATCH IS BUILT FROM THE TICKED SET ONLY. This loop is the guarantee:
    // an unticked field is never visited, so its key cannot reach the server.
    const patch: Patch = {};
    for (const f of fields) {
      if (!enabled.has(f.key)) continue;
      const raw = values[f.key] ?? "";
      if (f.kind === "bool") {
        (patch[f.key] as unknown) = raw === "yes";
      } else if (f.kind === "date") {
        (patch[f.key] as unknown) = raw === "" ? null : raw;
      } else {
        // "" from a select means the admin explicitly chose "— (clear)".
        (patch[f.key] as unknown) = raw === "" ? null : raw;
      }
    }
    if (Object.keys(patch).length === 0) return;

    const names = employees.length;
    if (!window.confirm(`Apply ${Object.keys(patch).length} change(s) to ${names} employee${names === 1 ? "" : "s"}?`)) return;

    setBusy(true);
    setResult(null);
    const res = await bulkEditEmployees(employees.map((e) => e.id), patch);
    setBusy(false);

    if (!res.ok && res.error) { setResult(res.error); return; }
    const failed = res.failed.length;
    setResult(
      failed === 0
        ? `Updated ${res.updated} employee${res.updated === 1 ? "" : "s"}.`
        : `Updated ${res.updated}; ${failed} failed — ${res.failed.map((f) => f.name).join(", ")}.`,
    );
    router.refresh();
    if (failed === 0) setTimeout(onDone, 900);
  }

/**
 * RENDERED INTO `document.body`, not in place.
 *
 * `position: fixed` is relative to the nearest ancestor with a `transform`,
 * `filter`, `perspective` or `contain` — and the admin shell has one. Left in
 * the tree, this overlay was laid out inside the content column: offset by the
 * sidebar, clipped at the bottom, and nowhere near the 94% of the VIEWPORT the
 * brief asks for (§5). A portal is the only reliable fix; widening the element
 * would just make a wrongly-positioned box bigger.
 *
 * Mounted behind a flag so the first client render matches the server's — the
 * server has no `document`, and calling `createPortal` during SSR throws.
 */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);  // the SSR guard above

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-[4vh_4vw]" role="dialog" aria-modal="true" aria-label="Bulk edit">
      <div className="flex max-h-[88vh] w-[min(760px,92vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-hairline-strong px-5 py-3">
          <h2 className="text-[15px] font-extrabold uppercase tracking-[0.06em] text-ink-strong">
            Bulk Edit — {employees.length} employee{employees.length === 1 ? "" : "s"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-lg p-1.5 text-ink-muted hover:bg-surface-soft">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
            Only ticked fields are changed. Anything left unticked keeps whatever each employee
            already has — it is not blanked.
          </p>

          <div className="flex flex-col gap-2.5">
            {fields.map((f) => {
              const on = enabled.has(f.key);
              return (
                <div key={f.key} className={`rounded-xl border px-3 py-2.5 transition-colors ${on ? "border-altus-red bg-white" : "border-hairline bg-surface-soft/60"}`}>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink-strong">
                    <input type="checkbox" checked={on} onChange={() => toggle(f.key)} className="size-3.5 accent-[var(--color-altus-red)]" />
                    {f.label}
                  </label>
                  {on && (
                    <div className="mt-2 pl-6">
                      {f.kind === "select" && (
                        <select
                          value={values[f.key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          className="w-full max-w-[340px] rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-[13px]"
                        >
                          <option value="">— (clear this field)</option>
                          {f.options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      )}
                      {f.kind === "bool" && (
                        <select
                          value={values[f.key] ?? "no"}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          className="w-32 rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-[13px]"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      )}
                      {f.kind === "date" && (
                        <input
                          type="date"
                          value={values[f.key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          className="rounded-lg border border-hairline-strong px-2 py-1.5 text-[13px]"
                        />
                      )}
                      {/* A field whose effect reaches past itself says so, and
                          says it here rather than in a doc nobody opens. Shift
                          Type decides pay basis, and this dialog applies it to
                          everybody ticked at once. */}
                      {f.warning && (
                        <p className="mt-1.5 max-w-[340px] text-[11.5px] font-semibold leading-snug text-altus-red">
                          {f.warning}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-4 rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
            <b>CTC is not bulk-editable.</b> Changing a salary structure across a selection is the
            one operation here that cannot be undone by re-running it, so it stays per employee in
            the workspace where the component split is visible while you change it.
          </p>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-hairline-strong px-5 py-3">
          {result && <span className="text-[12.5px] font-semibold text-ink-muted">{result}</span>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong px-3 py-2 text-[13px] font-semibold text-ink-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={busy || enabled.size === 0}
              className="rounded-lg bg-altus-red px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40"
            >
              {busy ? "Applying…" : `Apply to ${employees.length}`}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
