import { Download, FileSignature } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { MyDeclaration } from "@/components/hr/declaration/my-declaration";
import { myDeclarationState } from "@/app/(app)/hr/declaration/actions";

export const dynamic = "force-dynamic";

/**
 * MY DECLARATION — the employee's own copy.
 *
 * Open to anybody signed in, because it only ever shows the caller their own
 * record: `myDeclarationState` reads the employee id from the session and the
 * scan link is guarded again by `canReadDeclarationScan`. There is nothing here
 * to gate by role.
 *
 * Deliberately NOT a card on /policies. That page is the policy ledger's
 * surface, and the whole point of keeping this separate is that a signature over
 * the set as a whole is not the same record as a per-policy acknowledgement.
 */
export default async function MyDeclarationPage() {
  const me = await requireUser();
  const state = await myDeclarationState();

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "#FEE2E2", color: "#B91C1C" }}
        >
          <FileSignature className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">My Declaration</h1>
          <p className="text-[13px] text-ink-muted">
            One sheet confirming you have read the documents and policies issued to you, and that what
            you told us is accurate.
          </p>
        </div>
      </header>

      <div className="mb-3 rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-[15px] font-bold text-ink-strong">The declaration</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
          Download it as a PDF, already filled in with your name, and print it.
        </p>
        {/* A PLAIN LINK to an API route, not the /hr/letters page.
            `/hr/letters/*` is HR-STAFF only (`isHrStaff` = super-admin union the
            HR department), so it redirects almost every employee - including
            Ruchita, who keeps the signed file - straight back to /hr. Linking
            there would have sent people to a door that does not open for them.
            /api/hr/declaration/pdf takes no input and renders only the caller's
            own declaration. */}
        <a
          href="/api/hr/declaration/pdf"
          className="pastel-cta wg-btn mt-3 inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold"
        >
          <Download size={14} strokeWidth={2.6} /> Download my declaration (PDF)
        </a>
      </div>

      {state.ok ? (
        <MyDeclaration
          employeeId={me.id}
          acknowledgedAt={state.acknowledgedAt ? state.acknowledgedAt.toISOString() : null}
          hasScan={state.hasScan}
          scanFileName={state.scanFileName}
        />
      ) : (
        <div className="rounded-2xl border border-hairline-strong bg-white px-8 py-12 text-center">
          <h2 className="text-[17px] font-bold text-ink-strong">Cannot show your declaration</h2>
          <p className="mt-2 text-[14px] text-ink-muted">{state.error}</p>
        </div>
      )}
    </PageShell>
  );
}
