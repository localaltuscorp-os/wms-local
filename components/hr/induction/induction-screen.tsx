"use client";

import * as React from "react";
import { GraduationCap, Loader2, CircleCheck, UserRound } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { ONBOARDING_SECTIONS } from "@/lib/dossier/onboarding-schema";
import {
  getInduction,
  type InductionData,
  type InductionPerson,
} from "@/app/(app)/hr/induction/actions";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/** Only text-style fields carry into the read-only induction summary (files are
 *  reviewed in the dossier, not re-confirmed here). */
const TEXT_TYPES = new Set(["text", "tel", "number", "select"]);

/**
 * The post-joining INDUCTION surface. It never re-asks for data the joiner
 * already gave: pick the employee and their onboarding submission is rendered as
 * a clean, read-only, section-grouped summary to confirm on day one — name,
 * addresses, bank, PAN/Aadhaar and emergency contacts, straight from
 * `onboarding_submissions.fields`.
 */
export function InductionScreen({ people }: { people: InductionPerson[] }) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [data, setData] = React.useState<InductionData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const idRef = React.useRef("");

  async function select(id: string) {
    setEmployeeId(id);
    idRef.current = id;
    setData(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await getInduction(id);
      if (idRef.current !== id) return;
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setData(res.data);
    } catch {
      if (idRef.current === id) fireToast({ message: "Couldn't load induction details.", type: "error" });
    } finally {
      if (idRef.current === id) setLoading(false);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <PageShell width="narrow" py={false} className="pt-7 pb-24">
        <div className="mb-6 ind-fade">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <GraduationCap size={13} strokeWidth={2.6} /> HR · Induction
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Induction
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[15px] font-medium text-ink-muted">
            Confirm a new joiner&apos;s details on day one — pre-filled straight from the
            onboarding form they already completed. Nothing to re-type; just review and confirm.
          </p>
        </div>

        <div className="ind-fade rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
          <label htmlFor="ind-emp" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            Employee
          </label>
          <div className="ind-select-wrap">
            <select
              id="ind-emp"
              data-autofocus
              value={employeeId}
              onChange={(e) => void select(e.target.value)}
              className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-3 pr-9 text-[14.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
            >
              <option value="">— Select an employee —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {people.length === 0 && (
            <p className="mt-2 text-[13px] font-medium text-ink-muted">
              No submitted onboarding forms yet — once a joiner submits theirs, they appear here.
            </p>
          )}
        </div>

        {!employeeId ? null : loading ? (
          <div className="mt-6 grid place-items-center rounded-2xl border border-hairline bg-white py-20 text-ink-muted">
            <Loader2 className="animate-spin" style={{ color: RED }} />
            <p className="mt-2 text-[13.5px] font-medium">Loading induction details…</p>
          </div>
        ) : data ? (
          <InductionSummary data={data} />
        ) : null}
      </PageShell>
    </>
  );
}

function InductionSummary({ data }: { data: InductionData }) {
  const submittedLabel = data.submittedAt
    ? formatDate(data.submittedAt)
    : null;

  return (
    <div className="mt-6 ind-fade">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          <UserRound size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-black leading-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
            {data.employeeName}
          </p>
          <p className="truncate text-[13px] font-medium text-ink-muted">{data.designation ?? "Designation not set"}</p>
        </div>
        {data.status === "submitted" ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }}>
            <CircleCheck size={13} strokeWidth={2.6} /> Onboarding submitted{submittedLabel ? ` · ${submittedLabel}` : ""}
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center rounded-pill px-3 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #f59e0b 14%, white)", color: "#b45309" }}>
            Onboarding not submitted
          </span>
        )}
      </div>

      {/* Section-grouped, read-only summary */}
      <div className="grid gap-4">
        {ONBOARDING_SECTIONS.map((section) => {
          const rows = section.fields
            .filter((f) => TEXT_TYPES.has(f.type))
            .map((f) => ({ label: f.label, value: (data.fields[f.key] ?? "").trim() }))
            .filter((r) => r.value.length > 0);
          if (rows.length === 0) return null;
          return (
            <div key={section.key} className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
              <h2 className="mb-3 text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
                {section.title}
              </h2>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.label} className="min-w-0">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">{r.label}</dt>
                    <dd className="mt-0.5 break-words text-[14px] font-semibold text-ink-strong">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
        <UserRound size={13} className="mt-0.5 shrink-0" />
        Read-only — pulled live from the onboarding form. Corrections are made on the onboarding form itself, in the dossier.
      </p>
    </div>
  );
}

const CSS = `
  .ind-fade { animation: indFade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes indFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .ind-select-wrap { position: relative; }
  .ind-select-wrap::after { content: ""; position: absolute; right: 14px; top: 50%; width: 9px; height: 9px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { .ind-fade { animation: none !important; } }
`;

export default InductionScreen;
