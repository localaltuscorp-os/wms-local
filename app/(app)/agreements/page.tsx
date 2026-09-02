import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { FileSignature, CheckCircle2, ExternalLink, PenLine } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { getCurrentEmployee } from "@/lib/agreements/access";
import { agreementsEnabled } from "@/lib/agreements/flag";
import {
  rosterForAgreements,
  listAgreements,
  agreementsForEmployee,
} from "@/lib/agreements/queries";
import { AGREEMENT_TYPE_LABELS, AGREEMENT_STATUS_LABELS } from "@/db/enums";
import type { AgreementRow } from "@/lib/agreements/types";
import { Workbench } from "@/components/agreements/workbench";
import { signatureStatusMap } from "@/lib/documents/status";
import type { SignatureStatus } from "@/lib/documents/signing";
import { SignatureStatusPill } from "@/components/documents/signature-status-pill";
import { formatDate } from "@/lib/format";

type AgreementSignatureRecord = Record<
  string,
  { signatureId: string; status: SignatureStatus; signedPdfPath: string | null }
>;

async function signaturesFor(rows: AgreementRow[]): Promise<AgreementSignatureRecord> {
  const map = await signatureStatusMap("agreement", rows.map((r) => r.id));
  const out: AgreementSignatureRecord = {};
  for (const [docId, s] of map) {
    out[docId] = { signatureId: s.signatureId, status: s.status, signedPdfPath: s.signedPdfPath };
  }
  return out;
}

export const dynamic = "force-dynamic";

/* Employees-module identity (matches Salary · Documents). */
const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

export default async function AgreementsPage() {
  if (!agreementsEnabled()) notFound();

  const me = await getCurrentEmployee();
  if (!me) redirect("/login" as Route);

  const isAdmin = me.isAdmin;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header
          className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${GREEN} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${GREEN} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
          >
            <FileSignature size={13} strokeWidth={2.6} /> Employees · Agreements
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,42px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            {isAdmin ? "Agreements" : "My Agreements"}
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            {isAdmin
              ? "Draft appointment letters, employment agreements, NDAs and CTC letters from a template, watch the on-brand preview, then send them out to be e-signed."
              : "Your appointment letters, employment agreements, NDAs and CTC letters. Review and e-sign the ones sent to you."}
          </p>
        </header>

        {isAdmin ? (
          await (async () => {
            const [roster, agreements] = await Promise.all([
              rosterForAgreements(),
              listAgreements(),
            ]);
            const signatures = await signaturesFor(agreements);
            return <Workbench roster={roster} agreements={agreements} signatures={signatures} />;
          })()
        ) : (
          await (async () => {
            const rows = await agreementsForEmployee(me.id);
            const signatures = await signaturesFor(rows);
            return <EmployeeAgreements rows={rows} signatures={signatures} />;
          })()
        )}
      </main>
    </>
  );
}

/* ── Non-admin: read-only cards for the employee's own agreements ── */

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDate(d);
}

function EmployeeAgreements({
  rows,
  signatures,
}: {
  rows: AgreementRow[];
  signatures: AgreementSignatureRecord;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="wg-rise rounded-2xl bg-surface-card p-10 text-center"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        <p className="text-[15px] font-semibold text-ink-strong">No agreements yet</p>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          When HR sends you an agreement to sign, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => {
        const signed = r.status === "signed";
        const sig = signatures[r.id] ?? null;
        return (
          <article
            key={r.id}
            className="wg-rise flex flex-col rounded-2xl bg-surface-card p-5"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -22px rgba(15,23,42,0.35)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink-strong">{AGREEMENT_TYPE_LABELS[r.type]}</h3>
                <p className="mt-0.5 text-[12px] text-ink-subtle">{r.title}</p>
                {sig && (
                  <div className="mt-1.5">
                    <SignatureStatusPill status={sig.status} />
                  </div>
                )}
              </div>
              {signed ? (
                <span
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-bold"
                  style={{ background: "color-mix(in srgb, #15803d 16%, transparent)", color: "#15803d" }}
                >
                  <CheckCircle2 size={12} strokeWidth={2.6} /> Signed
                </span>
              ) : (
                <span
                  className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
                  style={{ background: "color-mix(in srgb, #C2740A 16%, transparent)", color: "#8A5207" }}
                >
                  {AGREEMENT_STATUS_LABELS[r.status]}
                </span>
              )}
            </div>

            <p className="mt-3 text-[12.5px] text-ink-muted">
              {signed
                ? `Signed on ${fmt(r.signedAt)}${r.signedName ? ` as ${r.signedName}` : ""}.`
                : r.sentAt
                  ? `Sent to you on ${fmt(r.sentAt)}. Please review and sign.`
                  : "Awaiting dispatch from HR."}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {signed ? (
                <a
                  href={`/agreements/pdf/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card px-3.5 py-2 text-[13px] font-semibold text-ink-strong hover:border-ink-soft"
                >
                  <ExternalLink size={13} strokeWidth={2.3} /> View PDF
                </a>
              ) : (
                <a
                  href={`/agreements/sign/${r.signToken}`}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold text-white"
                  style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
                >
                  <PenLine size={13} strokeWidth={2.4} /> Review &amp; Sign
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
