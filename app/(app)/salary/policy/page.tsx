import { CheckCircle2, FileText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PolicyUploadForm } from "@/components/salary/policy-upload-form";
import { SignaturePad } from "@/components/salary/signature-pad";
import { PolicyConsentTable } from "@/components/salary/policy-consent-table";
import { requireUser } from "@/lib/auth/current";
import { formatDate, formatTimeInTz, localDateString } from "@/lib/format";
import {
  getCurrentPolicy,
  getMyConsent,
  listConsentStatus,
} from "@/lib/queries/salary-policy";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) =>
  `${formatDate(localDateString("Asia/Kolkata", d))} · ${formatTimeInTz(d, "Asia/Kolkata")}`;

export default async function SalaryPolicyPage() {
  const me = await requireUser();
  const policy = await getCurrentPolicy();

  const [myConsent, consentStatus] = await Promise.all([
    policy ? getMyConsent(me.id, policy.version) : Promise.resolve(null),
    policy && me.isAdmin ? listConsentStatus(policy.version) : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1100px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-7">
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(40px, 4.2vw, 56px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Salary Policy
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 18 }}>
            {policy
              ? `Current version: ${policy.version}`
              : "Read and acknowledge the company salary policy"}
          </p>
        </header>

        {!policy ? (
          me.isAdmin ? (
            <PolicyUploadForm />
          ) : (
            <div
              className="rounded-section border border-solid border-hairline-strong bg-surface-card px-6 py-14 text-center"
              style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
            >
              <p
                className="font-serif text-ink-strong"
                style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
              >
                No policy published yet
              </p>
              <p className="text-[14px] text-ink-subtle mt-2">
                The salary policy will appear here once published by an administrator.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-7">
            {/* The policy document */}
            <section className="rounded-section border border-hairline bg-surface-card p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={18} strokeWidth={2.2} className="text-ink-soft" />
                  <h2 className="text-[16px] font-bold text-ink-strong">
                    Policy document · {policy.version}
                  </h2>
                </div>
                {policy.url ? (
                  <a
                    href={policy.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2 px-4 text-[14px] font-medium text-ink-strong hover:border-hairline-strong transition-colors"
                  >
                    Open PDF
                  </a>
                ) : (
                  <span className="text-[13px] text-ink-subtle">PDF link unavailable</span>
                )}
              </div>
              {policy.url ? (
                <iframe
                  src={policy.url}
                  title={`Salary policy ${policy.version}`}
                  className="w-full rounded-md border border-hairline"
                  style={{ height: 560 }}
                />
              ) : null}
            </section>

            {/* Consent status / sign */}
            {myConsent ? (
              <div className="rounded-section border border-hairline bg-surface-card p-6 flex items-center gap-3">
                <CheckCircle2 size={22} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                <div>
                  <p className="text-[15px] font-bold text-ink-strong">
                    You have acknowledged this policy
                  </p>
                  <p className="text-[13px] text-ink-subtle mt-0.5">
                    Signed {fmtDate(myConsent.signedAt)} ({myConsent.signatureKind === "draw" ? "drawn" : "uploaded"} signature)
                  </p>
                </div>
              </div>
            ) : (
              <SignaturePad />
            )}

            {/* Admin tools */}
            {me.isAdmin ? (
              <>
                <PolicyUploadForm compact />

                <section className="rounded-section border border-hairline bg-surface-card overflow-hidden">
                  <div className="px-6 py-4 border-b border-hairline">
                    <h2 className="text-[16px] font-bold text-ink-strong">Consent Overview</h2>
                    <p className="text-[13px] text-ink-subtle mt-0.5">
                      {consentStatus.filter((r) => r.consented).length} of {consentStatus.length}{" "}
                      active employees have acknowledged {policy.version}.
                    </p>
                  </div>
                  <PolicyConsentTable rows={consentStatus} />
                </section>
              </>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
