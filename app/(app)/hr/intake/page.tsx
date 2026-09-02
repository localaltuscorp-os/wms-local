
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listInterviewPositions, listCandidateDrafts, getCandidateDraft } from "@/app/(app)/hr/candidate-actions";
import { PageShell } from "@/components/layout/page-shell";
import { listDepartments } from "@/lib/queries/departments";
import { IntakeFormLauncher } from "@/components/hr/candidate/intake-form-launcher";
import { IntakeChooser } from "@/components/hr/candidate/intake-chooser";
import type { IntakeInitial } from "@/components/hr/candidate/intake-wizard";

export const dynamic = "force-dynamic";

/**
 * Pre-Interview → Candidate Interview Form. Default view = the New/Continue
 * chooser. `?new=1` opens a fresh wizard; `?draft=<id>` resumes/edits a saved
 * candidate. The wizard autosaves to the DB, so nothing is lost on refresh/leave.
 */
export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; draft?: string }>;
}) {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const sp = await searchParams;

  // ── Wizard mode: new form, or resume/edit an existing candidate ──
  if (sp.new || sp.draft) {
    const [positions, depts] = await Promise.all([
      listInterviewPositions().catch(() => [] as string[]),
      listDepartments().catch(() => []),
    ]);
    const departments = depts.filter((d) => d.isActive).map((d) => d.name);

    let initial: IntakeInitial | undefined;
    if (sp.draft) {
      const d = await getCandidateDraft(sp.draft).catch(() => null);
      if (d) {
        initial = {
          draftId: d.id,
          values: d.values,
          instances: d.instances,
          startAtReview: d.submitted,
        };
      }
    }
    return <IntakeFormLauncher positions={positions} departments={departments} canManagePositions={isAdmin} initial={initial} />;
  }

  // ── Chooser mode (default): start new or continue an unfinished form ──
  const drafts = await listCandidateDrafts().catch(() => []);
  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>
      <PageShell width="narrow" py={false} className="pt-10 pb-20">
        <IntakeChooser drafts={drafts} />
      </PageShell>
    </div>
  );
}
