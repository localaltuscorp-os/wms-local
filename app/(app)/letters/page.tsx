import { Mail, FileSignature } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { DashboardHeader } from "@/components/layout/header";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listAllLetters, listMyLetters, listActiveRoster } from "@/lib/hr/sections";
import { LettersWorkspace } from "@/components/hr/letters/letters-workspace";
import { signatureStatusMap } from "@/lib/documents/status";
import { listSalaryProfiles } from "@/lib/queries/salary";
import {
  ExitDocumentsWorkbench,
  type EmployeeOption,
} from "@/components/salary/exit-documents-workbench";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** Known paying entities so the exit-doc signatory mapping is always selectable. */
const SEED_ENTITIES = ["Altus Corp", "MJV HUF", "JSV HUF", "Unleashed"];

export default async function LettersPage() {
  const me = await requireWorkspace("hr");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Letters"
        Icon={Mail}
        blurb="HR letters — offer, confirmation, increment and experience letters, per employee. This section is being built."
      />
    );
  }

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const [letters, roster] = await Promise.all([
    isAdmin ? listAllLetters() : listMyLetters(me.id),
    isAdmin ? listActiveRoster() : Promise.resolve([]),
  ]);

  // Signature status per letter (resilient — empty if signing isn't applied yet).
  const sigMap = await signatureStatusMap(
    "letter",
    letters.map((l) => l.id),
  );
  const signatures: Record<
    string,
    { signatureId: string; status: "pending" | "verified" | "signed"; signedPdfPath: string | null }
  > = {};
  for (const [docId, s] of sigMap) {
    signatures[docId] = {
      signatureId: s.signatureId,
      status: s.status,
      signedPdfPath: s.signedPdfPath,
    };
  }

  // Exit-documents builder (admin only) — moved here from Salary · Documents.
  let exitEmployees: EmployeeOption[] = [];
  let exitEntities: string[] = [];
  if (isAdmin) {
    const profiles = await listSalaryProfiles();
    exitEmployees = profiles.map((p) => ({
      employeeId: p.employeeId,
      name: p.name,
      designation: p.designationName,
      entity: p.payingEntityName,
    }));
    exitEntities = Array.from(
      new Set([
        ...SEED_ENTITIES,
        ...profiles.map((p) => p.payingEntityName).filter((x): x is string => Boolean(x)),
      ]),
    ).sort((a, b) => a.localeCompare(b));
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Letters
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            {isAdmin ? "HR Letters" : "My Letters"}
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[13.5px] font-medium text-ink-muted">
            {isAdmin
              ? "Issue and archive offer, confirmation, increment and experience letters per employee. Each person sees their own here."
              : "Your offer, confirmation, increment and experience letters, all in one place."}
          </p>
        </header>
        <LettersWorkspace
          letters={letters}
          isAdmin={isAdmin}
          roster={roster}
          signatures={signatures}
        />

        {isAdmin && (
          <section className="mt-12">
            <div
              className="mb-5 h-px w-full"
              style={{ background: "var(--color-hairline)" }}
            />
            <header className="mb-5">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                <FileSignature size={13} strokeWidth={2.6} /> Off-boarding
              </span>
              <h2
                className="mt-1.5 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(22px,2.4vw,30px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                }}
              >
                Exit Documents
              </h2>
              <p className="mt-1.5 max-w-[76ch] text-[13.5px] font-medium text-ink-muted">
                Generate the Full &amp; Final Settlement, Return of Company Assets and Handover
                Accepted letters — each closed with the entity&apos;s Authorised Signatory block.
                Pick an employee to also archive the letter and send it for DigiLocker-verified
                e-signing.
              </p>
            </header>
            <ExitDocumentsWorkbench employees={exitEmployees} entities={exitEntities} />
          </section>
        )}
      </main>
    </>
  );
}
