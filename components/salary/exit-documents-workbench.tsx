"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Printer, ShieldCheck, PenLine, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { SignatoryBlock } from "@/components/salary/signatory-block";
import { signatoryForEntity } from "@/lib/salary/signatories";
import { saveExitDocForSigning } from "@/app/(app)/letters/actions";
import {
  EXIT_LETTER_META,
  EXIT_LETTER_TYPES,
  renderExitLetter,
  type ExitLetterInput,
  type ExitLetterType,
} from "@/lib/salary/exit-letters";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

export interface EmployeeOption {
  employeeId: string;
  name: string;
  designation: string | null;
  entity: string | null;
}

/**
 * WS-5 — Management → Employee exit-document builder. Pick an employee (or type
 * a name), fill in the blanks, watch the live on-brand preview, then download
 * the PDF (payslip house style) or print. The signatory block resolves from the
 * paying entity automatically.
 */
export function ExitDocumentsWorkbench({
  employees,
  entities,
}: {
  employees: EmployeeOption[];
  entities: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<ExitLetterType>("full-and-final");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [employeeName, setEmployeeName] = useState("");
  const [designation, setDesignation] = useState("");
  const [entity, setEntity] = useState<string>(entities[0] ?? "Altus Corp");
  const [letterDate, setLetterDate] = useState(today);
  const [place, setPlace] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  // Full & Final
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementBreakup, setSettlementBreakup] = useState("");
  // Return of assets
  const [assets, setAssets] = useState("");
  const [assetReturnBy, setAssetReturnBy] = useState("");
  // Handover
  const [handoverTo, setHandoverTo] = useState("");
  const [handoverSummary, setHandoverSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);

  function onPickEmployee(id: string) {
    setEmployeeId(id);
    setSavedDocId(null);
    const emp = employees.find((e) => e.employeeId === id);
    if (emp) {
      setEmployeeName(emp.name);
      setDesignation(emp.designation ?? "");
      if (emp.entity) setEntity(emp.entity);
    }
  }

  const input: ExitLetterInput = useMemo(
    () => ({
      type,
      employeeName,
      designation,
      entity,
      letterDate,
      place,
      lastWorkingDay,
      settlementAmount,
      settlementBreakup,
      assets,
      assetReturnBy,
      handoverTo,
      handoverSummary,
    }),
    [
      type, employeeName, designation, entity, letterDate, place, lastWorkingDay,
      settlementAmount, settlementBreakup, assets, assetReturnBy, handoverTo, handoverSummary,
    ],
  );

  const letter = useMemo(() => renderExitLetter(input), [input]);
  const signatory = useMemo(() => signatoryForEntity(entity), [entity]);
  const dateLabel = useMemo(() => {
    if (!letterDate) return "";
    const d = new Date(`${letterDate}T00:00:00`);
    return Number.isNaN(d.getTime()) ? letterDate : formatDate(d);
  }, [letterDate]);

  async function onDownload() {
    if (!employeeName.trim()) {
      fireToast({ message: "Enter the employee's name first." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/salary/documents/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        fireToast({ message: `Could not generate the PDF (${res.status}).` });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${EXIT_LETTER_META[type].type}-${employeeName.replace(/\s+/g, "")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      fireToast({ message: "Network error while generating the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function onSaveForSigning() {
    if (!employeeId) {
      fireToast({ message: "Pick an employee from the list to enable signing." });
      return;
    }
    if (!employeeName.trim()) {
      fireToast({ message: "Enter the employee's name first." });
      return;
    }
    setSaving(true);
    try {
      const res = await saveExitDocForSigning({
        employeeId,
        type,
        employeeName: employeeName.trim(),
        entity,
        designation: designation.trim() || undefined,
        letterDate: letterDate || undefined,
        place: place.trim() || undefined,
        lastWorkingDay: lastWorkingDay || undefined,
        settlementAmount: settlementAmount.trim() || undefined,
        settlementBreakup: settlementBreakup.trim() || undefined,
        assets: assets.trim() || undefined,
        assetReturnBy: assetReturnBy || undefined,
        handoverTo: handoverTo.trim() || undefined,
        handoverSummary: handoverSummary.trim() || undefined,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setSavedDocId(res.id);
      fireToast({ message: "Archived. Ready for DigiLocker-verified signing.", type: "success" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ── Form ── */}
      <section
        className="exit-docs-form rounded-2xl bg-surface-card p-5"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -20px rgba(15,23,42,0.35)" }}
      >
        {/* Document type */}
        <div className="mb-4 flex flex-wrap gap-2">
          {EXIT_LETTER_TYPES.map((t) => {
            const active = t === type;
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setSavedDocId(null); }}
                className="rounded-pill px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                style={
                  active
                    ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, color: "#fff" }
                    : { background: "var(--color-surface-card)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
                }
              >
                {EXIT_LETTER_META[t].title.replace(" Letter", "")}
              </button>
            );
          })}
        </div>
        <p className="mb-4 text-[12.5px] text-ink-subtle">{EXIT_LETTER_META[type].blurb}</p>

        <div className="grid grid-cols-1 gap-3.5">
          <Field label="Employee (from salary profiles)">
            <select
              value={employeeId}
              onChange={(e) => onPickEmployee(e.target.value)}
              className="ui-input"
            >
              <option value="">— type manually below —</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.name}
                  {e.entity ? ` · ${e.entity}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Employee name">
              <input className="ui-input" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Designation">
              <input className="ui-input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Optional" />
            </Field>
          </div>

          <Field label="Paying entity (sets the signatory)">
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className="ui-input">
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
              <input type="date" className="ui-input" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} />
            </Field>
            <Field label="Place">
              <input className="ui-input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Ahmedabad" />
            </Field>
          </div>

          <Field label="Last working day">
            <input type="date" className="ui-input" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
          </Field>

          {type === "full-and-final" && (
            <>
              <Field label="Net settlement amount">
                <input className="ui-input" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} placeholder="e.g. ₹1,24,500" />
              </Field>
              <Field label="Settlement breakup (one 'Label: Value' per line)">
                <textarea className="ui-input" rows={4} value={settlementBreakup} onChange={(e) => setSettlementBreakup(e.target.value)} placeholder={"Salary payable: ₹1,10,000\nLess Professional Tax: ₹200\nLess advances: ₹5,000"} />
              </Field>
            </>
          )}

          {type === "return-of-assets" && (
            <>
              <Field label="Assets to return (one per line)">
                <textarea className="ui-input" rows={4} value={assets} onChange={(e) => setAssets(e.target.value)} placeholder={"Laptop (Dell, S/N ...)\nAccess card\nCompany SIM"} />
              </Field>
              <Field label="Return by">
                <input type="date" className="ui-input" value={assetReturnBy} onChange={(e) => setAssetReturnBy(e.target.value)} />
              </Field>
            </>
          )}

          {type === "handover-accepted" && (
            <>
              <Field label="Handover accepted by">
                <input className="ui-input" value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)} placeholder="Name / manager" />
              </Field>
              <Field label="Handover summary (one item per line)">
                <textarea className="ui-input" rows={4} value={handoverSummary} onChange={(e) => setHandoverSummary(e.target.value)} placeholder={"Client files handed to ...\nPending items documented\nCredentials transferred"} />
              </Field>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onDownload}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
          >
            <Download size={15} strokeWidth={2.4} />
            {busy ? "Generating…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card px-4 py-2.5 text-[14px] font-medium text-ink-strong hover:border-hairline-strong"
          >
            <Printer size={15} strokeWidth={2.2} />
            Print Preview
          </button>
        </div>

        {/* Archive + DigiLocker-verified signing */}
        <div className="mt-4 rounded-xl border border-hairline bg-surface-soft p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            <ShieldCheck size={14} strokeWidth={2.4} style={{ color: GREEN_DEEP }} />
            E-signing
          </div>
          {savedDocId ? (
            <div>
              <p className="mb-2.5 text-[12.5px] text-ink-muted">
                Archived to the employee&apos;s document vault. Open the verified signing flow
                (DigiLocker · Aadhaar e-KYC) to complete it.
              </p>
              <a
                href={`/documents/sign?kind=exit_doc&doc=${savedDocId}`}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
              >
                <PenLine size={14} strokeWidth={2.4} />
                Open Signing
              </a>
            </div>
          ) : (
            <div>
              <p className="mb-2.5 text-[12.5px] text-ink-muted">
                {employeeId
                  ? "Archive this letter to the employee's vault and enable DigiLocker-verified e-signing."
                  : "Pick an employee from the list above to archive this letter and enable e-signing."}
              </p>
              <button
                type="button"
                onClick={onSaveForSigning}
                disabled={saving || !employeeId}
                className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-[13.5px] font-semibold disabled:opacity-50"
                style={{ color: GREEN_DEEP, borderColor: `color-mix(in srgb, ${GREEN} 40%, transparent)` }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" strokeWidth={2.4} />
                ) : (
                  <ShieldCheck size={14} strokeWidth={2.4} />
                )}
                {saving ? "Archiving…" : "Save & Enable E-Signing"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Live preview (also the print surface) ── */}
      <section
        id="exit-doc-preview"
        className="rounded-2xl bg-white p-8 max-md:p-5"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -20px rgba(15,23,42,0.35)" }}
      >
        <div className="mb-4 flex items-center gap-2" style={{ color: GREEN_DEEP }}>
          <FileText size={16} strokeWidth={2.4} />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Preview</span>
        </div>

        <h2
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}
        >
          {letter.title}
        </h2>
        <div className="mt-3 text-[13px] text-ink-soft">{letter.dateLine}</div>

        <div className="mt-4 text-[13.5px] leading-relaxed text-ink-muted">
          <div className="font-semibold text-ink-strong">To,</div>
          {letter.recipientBlock.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>

        <div className="mt-4 text-[13.5px] font-bold text-ink-strong">{letter.subject}</div>
        <div className="mt-3 text-[13.5px] text-ink-muted">{letter.salutation}</div>

        <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-muted">
          {letter.body.map((p, i) => (
            <p key={i} style={{ whiteSpace: "pre-wrap" }}>{p}</p>
          ))}
        </div>

        {letter.particulars && letter.particulars.length > 0 && (
          <table className="mt-4 w-full border border-hairline-strong text-[13px]">
            <tbody>
              {letter.particulars.map((p, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-1.5 text-ink-muted">{p.label}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-ink-strong">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-5 text-[13.5px] text-ink-muted">{letter.closing}</div>

        <div className="mt-6 flex justify-end">
          <SignatoryBlock entity={entity} signatory={signatory} date={dateLabel} place={place} />
        </div>
      </section>

      <style jsx global>{`
        .exit-docs-form .ui-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 8px 10px;
          font-size: 13.5px;
          color: var(--color-ink-strong);
          outline: none;
        }
        .exit-docs-form .ui-input:focus {
          border-color: ${GREEN};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${GREEN} 18%, transparent);
        }
        @media print {
          body * { visibility: hidden !important; }
          #exit-doc-preview, #exit-doc-preview * { visibility: visible !important; }
          #exit-doc-preview {
            position: absolute; left: 0; top: 0; width: 100%;
            box-shadow: none !important; padding: 0 !important;
          }
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
