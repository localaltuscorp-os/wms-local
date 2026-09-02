"use client";

import { useMemo, useState } from "react";
import { FileDown, Save, Send } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { renderAgreement, type AgreementInput } from "@/lib/agreements/templates";
import { signatoryForEntity } from "@/lib/salary/signatories";
import { AgreementPreview } from "@/components/agreements/agreement-preview";
import { AGREEMENT_TYPE_LABELS, type AgreementType } from "@/db/enums";
import type { AgreementEmployee, AgreementRow } from "@/lib/agreements/types";
import { TemplatePicker } from "@/components/agreements/template-picker";
import { StatusTracker, type AgreementSignatures } from "@/components/agreements/status-tracker";
import { saveAgreement, sendAgreement } from "@/app/(app)/agreements/actions";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

/** Known paying entities so the signatory is always selectable. */
const SEED_ENTITIES = ["Altus Corp", "MJV HUF", "JSV HUF", "Unleashed"];

type FieldKind = "text" | "date" | "textarea";
interface FieldDef {
  key: keyof AgreementInput;
  label: string;
  kind: FieldKind;
  placeholder?: string;
}

/** Which fill-in fields each template surfaces (entity + letter date + place are shared). */
const FIELDS: Record<AgreementType, FieldDef[]> = {
  appointment: [
    { key: "designation", label: "Designation", kind: "text", placeholder: "e.g. Senior Associate" },
    { key: "department", label: "Department", kind: "text", placeholder: "e.g. Operations" },
    { key: "joiningDate", label: "Joining date", kind: "date" },
    { key: "ctcAmount", label: "Annual CTC", kind: "text", placeholder: "e.g. ₹6,00,000" },
    { key: "ctcBreakup", label: "CTC breakup (one 'Label: Value' per line)", kind: "textarea", placeholder: "Basic: ₹3,00,000\nHRA: ₹1,20,000\nSpecial allowance: ₹1,80,000" },
    { key: "probationMonths", label: "Probation (months)", kind: "text", placeholder: "e.g. 6" },
    { key: "reportingTo", label: "Reporting to", kind: "text", placeholder: "e.g. Manan Vasa" },
    { key: "workLocation", label: "Work location", kind: "text", placeholder: "e.g. Ahmedabad" },
    { key: "noticePeriod", label: "Notice period", kind: "text", placeholder: "e.g. 30 days" },
    { key: "extraClauses", label: "Extra clauses (one per line)", kind: "textarea", placeholder: "Optional additional terms" },
  ],
  employment: [
    { key: "designation", label: "Designation", kind: "text", placeholder: "e.g. Senior Associate" },
    { key: "department", label: "Department", kind: "text", placeholder: "e.g. Operations" },
    { key: "joiningDate", label: "Effective date", kind: "date" },
    { key: "ctcAmount", label: "Annual CTC", kind: "text", placeholder: "e.g. ₹6,00,000" },
    { key: "ctcBreakup", label: "CTC breakup (one 'Label: Value' per line)", kind: "textarea", placeholder: "Basic: ₹3,00,000\nHRA: ₹1,20,000" },
    { key: "noticePeriod", label: "Notice period", kind: "text", placeholder: "e.g. 60 days" },
    { key: "extraClauses", label: "Extra clauses (one per line)", kind: "textarea", placeholder: "Optional additional terms" },
  ],
  nda: [
    { key: "joiningDate", label: "Engagement date", kind: "date" },
    { key: "confidentialityYears", label: "Confidentiality term (years)", kind: "text", placeholder: "e.g. 3" },
    { key: "extraClauses", label: "Extra clauses (one per line)", kind: "textarea", placeholder: "Optional additional terms" },
  ],
  ctc: [
    { key: "designation", label: "Designation", kind: "text", placeholder: "e.g. Senior Associate" },
    { key: "joiningDate", label: "Effective date", kind: "date" },
    { key: "ctcAmount", label: "Annual CTC", kind: "text", placeholder: "e.g. ₹6,00,000" },
    { key: "ctcBreakup", label: "CTC breakup (one 'Label: Value' per line)", kind: "textarea", placeholder: "Basic: ₹3,00,000\nHRA: ₹1,20,000\nSpecial allowance: ₹1,80,000" },
    { key: "extraClauses", label: "Extra clauses (one per line)", kind: "textarea", placeholder: "Optional additional terms" },
  ],
  probation_confirmation: [
    { key: "designation", label: "Designation", kind: "text", placeholder: "e.g. Senior Associate" },
    { key: "department", label: "Department", kind: "text", placeholder: "e.g. Operations" },
    { key: "probationEndDate", label: "Probation ended on", kind: "date" },
    { key: "effectiveDate", label: "Confirmed with effect from", kind: "date" },
    { key: "noticePeriod", label: "Notice period", kind: "text", placeholder: "e.g. 30 days" },
    { key: "extraClauses", label: "Extra clauses (one per line)", kind: "textarea", placeholder: "Optional additional terms" },
  ],
  training_completion: [
    { key: "designation", label: "Designation", kind: "text", placeholder: "e.g. Senior Associate" },
    { key: "trainingEndDate", label: "Training ended on", kind: "date" },
    { key: "effectiveDate", label: "Salary payable from", kind: "date" },
    { key: "ctcAmount", label: "Annual CTC", kind: "text", placeholder: "e.g. ₹6,00,000" },
    { key: "extraClauses", label: "Extra clauses (one per line)", kind: "textarea", placeholder: "Optional additional terms" },
  ],
};

type FV = Record<string, string>;

function fmtCtc(annual: string | null): string {
  if (!annual) return "";
  const n = Number(annual);
  if (!Number.isFinite(n) || n <= 0) return annual;
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Admin agreement workbench — pick an employee + template, fill in the blanks,
 * watch the on-brand letter recompute live, then save / generate PDF / send. The
 * tracker of every agreement sits below.
 */
export function Workbench({
  roster,
  agreements,
  signatures = {},
}: {
  roster: AgreementEmployee[];
  agreements: AgreementRow[];
  signatures?: AgreementSignatures;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<AgreementType>("appointment");
  const [entity, setEntity] = useState(SEED_ENTITIES[0]!);
  const [fv, setFv] = useState<FV>({ letterDate: today });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "pdf" | "send">(null);

  const emp = useMemo(() => roster.find((e) => e.id === employeeId), [roster, employeeId]);
  const employeeName = emp?.name ?? "";

  const entities = useMemo(
    () =>
      Array.from(
        new Set([...SEED_ENTITIES, ...roster.map((r) => r.entity).filter((x): x is string => Boolean(x))]),
      ).sort((a, b) => a.localeCompare(b)),
    [roster],
  );

  function set(key: string, value: string) {
    setFv((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function onPickEmployee(id: string) {
    setEmployeeId(id);
    setSavedId(null);
    setDirty(true);
    const e = roster.find((x) => x.id === id);
    if (!e) return;
    if (e.entity) setEntity(e.entity);
    setFv((prev) => ({
      ...prev,
      designation: e.designation ?? prev.designation ?? "",
      department: e.department ?? prev.department ?? "",
      joiningDate: e.joiningDate ?? prev.joiningDate ?? "",
      ctcAmount: fmtCtc(e.annualCtc) || prev.ctcAmount || "",
    }));
  }

  const input: AgreementInput = useMemo(
    () => ({
      type,
      employeeName,
      entity,
      designation: fv.designation ?? null,
      department: fv.department ?? null,
      letterDate: fv.letterDate ?? null,
      place: fv.place ?? null,
      joiningDate: fv.joiningDate ?? null,
      ctcAmount: fv.ctcAmount ?? null,
      ctcBreakup: fv.ctcBreakup ?? null,
      probationMonths: fv.probationMonths ?? null,
      reportingTo: fv.reportingTo ?? null,
      workLocation: fv.workLocation ?? null,
      noticePeriod: fv.noticePeriod ?? null,
      confidentialityYears: fv.confidentialityYears ?? null,
      probationEndDate: fv.probationEndDate ?? null,
      trainingEndDate: fv.trainingEndDate ?? null,
      effectiveDate: fv.effectiveDate ?? null,
      extraClauses: fv.extraClauses ?? null,
    }),
    [type, employeeName, entity, fv],
  );

  const rendered = useMemo(() => renderAgreement(input), [input]);
  const signatory = useMemo(() => signatoryForEntity(entity), [entity]);

  /** Persist the current state as a draft; returns the id or null on failure. */
  async function persist(): Promise<string | null> {
    if (!employeeId) {
      fireToast({ message: "Pick an employee first.", type: "error" });
      return null;
    }
    if (savedId && !dirty) return savedId;
    const res = await saveAgreement({
      id: savedId ?? undefined,
      employeeId,
      type,
      entity,
      title: `${AGREEMENT_TYPE_LABELS[type]} — ${employeeName}`,
      fieldValues: fv,
    });
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return null;
    }
    setSavedId(res.id);
    setSavedToken(res.signToken);
    setDirty(false);
    return res.id;
  }

  async function onSaveDraft() {
    setBusy("save");
    try {
      const id = await persist();
      if (id) fireToast({ message: "Draft saved." });
    } finally {
      setBusy(null);
    }
  }

  async function onGeneratePdf() {
    setBusy("pdf");
    try {
      const id = await persist();
      if (id) window.open(`/agreements/pdf/${id}`, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }

  async function onSend() {
    setBusy("send");
    try {
      const id = await persist();
      if (!id) return;
      const res = await sendAgreement(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const token = savedToken ?? agreements.find((a) => a.id === id)?.signToken;
      const link = `${window.location.origin}/agreements/sign/${token ?? ""}`;
      fireToast({
        message: token ? "Sent. Copy the sign link for the employee." : "Sent to the employee.",
        actionLabel: token ? "Copy link" : undefined,
        action: token ? () => navigator.clipboard?.writeText(link) : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        {/* ── Builder ── */}
        <section
          className="agreements-form wg-rise rounded-2xl bg-surface-card p-5 max-md:p-4"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -20px rgba(15,23,42,0.35)" }}
        >
          <TemplatePicker value={type} onChange={(t) => { setType(t); setDirty(true); }} />

          <div className="mt-4 grid grid-cols-1 gap-3.5">
            <Field label="Employee">
              <select className="ui-input" value={employeeId} onChange={(e) => onPickEmployee(e.target.value)}>
                <option value="">— select an employee —</option>
                {roster.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.designation ? ` · ${e.designation}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Paying entity (sets the signatory)">
              <select className="ui-input" value={entity} onChange={(e) => { setEntity(e.target.value); setDirty(true); }}>
                {entities.map((en) => (
                  <option key={en} value={en}>{en}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11.5px] text-ink-subtle">
                Signatory: <b>{signatory.name}</b>
              </span>
            </Field>

            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Letter date">
                <input type="date" className="ui-input" value={fv.letterDate ?? ""} onChange={(e) => set("letterDate", e.target.value)} />
              </Field>
              <Field label="Place">
                <input className="ui-input" value={fv.place ?? ""} onChange={(e) => set("place", e.target.value)} placeholder="e.g. Ahmedabad" />
              </Field>
            </div>

            {FIELDS[type].map((f) => (
              <Field key={f.key} label={f.label}>
                {f.kind === "textarea" ? (
                  <textarea
                    className="ui-input"
                    rows={4}
                    value={fv[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <input
                    type={f.kind === "date" ? "date" : "text"}
                    className="ui-input"
                    value={fv[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card px-4 py-2.5 text-[14px] font-semibold text-ink-strong hover:border-ink-soft disabled:opacity-50"
            >
              <Save size={15} strokeWidth={2.3} />
              {busy === "save" ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={onGeneratePdf}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
            >
              <FileDown size={15} strokeWidth={2.4} />
              {busy === "pdf" ? "Generating…" : "Generate PDF"}
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
              style={{ color: GREEN_DEEP, borderColor: `color-mix(in srgb, ${GREEN} 40%, transparent)` }}
            >
              <Send size={15} strokeWidth={2.3} />
              {busy === "send" ? "Sending…" : "Send to Employee"}
            </button>
          </div>
        </section>

        {/* ── Live preview ── */}
        <section className="wg-rise">
          <AgreementPreview rendered={rendered} signatory={signatory} signed={null} />
        </section>
      </div>

      <StatusTracker rows={agreements} signatures={signatures} />

      <style jsx global>{`
        .agreements-form .ui-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 8px 10px;
          font-size: 13.5px;
          color: var(--color-ink-strong);
          outline: none;
        }
        .agreements-form .ui-input:focus {
          border-color: ${GREEN};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${GREEN} 18%, transparent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}
