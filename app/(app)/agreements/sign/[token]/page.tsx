import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { agreementsEnabled } from "@/lib/agreements/flag";
import { getAgreementByToken } from "@/lib/agreements/queries";
import { renderAgreement } from "@/lib/agreements/templates";
import { AgreementPreview } from "@/components/agreements/agreement-preview";
import { signatoryForEntity } from "@/lib/salary/signatories";
import { SignPanel } from "@/components/agreements/sign-panel";
import { getSignatureState } from "@/app/(app)/documents/sign/actions";
import { SignDocument } from "@/components/documents/sign/sign-document";
import type { SignatureState } from "@/lib/documents/signing";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return formatDate(d);
}

/**
 * Agreements · the employee's focused e-sign surface. Reached via an unguessable
 * per-agreement token link. Renders the read-only letter preview and, below it,
 * either the sign panel (draft/sent) or a signed-confirmation banner. This lives
 * under (app) so the visitor is authed; the sign action re-checks ownership.
 */
export default async function SignAgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!agreementsEnabled()) notFound();

  const { token } = await params;
  const found = await getAgreementByToken(token);
  if (!found) notFound();

  const { agreement, employeeName } = found;
  const rendered = renderAgreement({
    type: agreement.type,
    employeeName,
    entity: agreement.entity ?? "",
    ...agreement.fieldValues,
  });
  const signatory = signatoryForEntity(agreement.entity);
  const isSigned = agreement.status === "signed";

  // DigiLocker-verified signing state for this agreement (owner/admin-guarded).
  // If the viewer isn't the owner/admin, or the table isn't applied yet, this
  // throws — we fall back to the legacy typed-name sign panel so nothing 500s.
  let sigState: SignatureState | null = null;
  if (!isSigned) {
    try {
      sigState = await getSignatureState({ docKind: "agreement", docId: agreement.id });
    } catch {
      sigState = null;
    }
  }

  return (
    <div className="min-h-full bg-surface-soft py-8 max-md:py-5">
      <div className="mx-auto w-full max-w-[760px] px-4">
        {/* Branded header */}
        <header className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Altus" className="h-9 w-auto" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              Review &amp; sign
            </div>
            <h1 className="truncate text-[17px] font-bold tracking-tight text-ink-strong">
              {agreement.title}
            </h1>
          </div>
        </header>

        {/* Read-only letter */}
        <div className="wg-rise">
          <AgreementPreview
            rendered={rendered}
            signatory={signatory}
            signed={
              isSigned
                ? { name: agreement.signedName ?? employeeName, at: fmtDate(agreement.signedAt ?? new Date()) }
                : null
            }
          />
        </div>

        {/* Sign panel OR confirmation */}
        <div className="mx-auto mt-6 w-full max-w-[720px]">
          {isSigned ? (
            <div className="wg-rise flex flex-col gap-4 rounded-2xl border border-hairline bg-surface-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full"
                  style={{ background: "color-mix(in srgb, #15803d 14%, transparent)" }}
                >
                  <CheckCircle2 size={20} strokeWidth={2.2} style={{ color: "#15803d" }} />
                </span>
                <div>
                  <div className="text-[14px] font-bold text-ink-strong">
                    Signed by {agreement.signedName ?? employeeName}
                  </div>
                  <div className="text-[12.5px] text-ink-soft">
                    on {fmtDate(agreement.signedAt ?? new Date())}
                  </div>
                </div>
              </div>
              <a
                href={`/agreements/pdf/${agreement.id}`}
                className="brand-btn wg-btn wg-sheen inline-flex items-center justify-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white whitespace-nowrap"
                style={{
                  background: "linear-gradient(135deg, #15803d, #0f5f2d)",
                  boxShadow:
                    "0 8px 20px -10px color-mix(in srgb, #0f5f2d 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                <Download size={15} strokeWidth={2.4} />
                Download Signed PDF
              </a>
            </div>
          ) : sigState ? (
            <SignDocument docKind="agreement" docId={agreement.id} initialState={sigState} />
          ) : (
            <SignPanel token={token} employeeName={employeeName} agreementTitle={agreement.title} />
          )}
        </div>
      </div>
    </div>
  );
}
