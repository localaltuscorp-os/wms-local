import { requireWorkspace } from "@/lib/auth/workspace-access";
import { canActAsHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { loadRecruitmentJdData } from "@/lib/queries/recruitment-jd";
import { RecruitmentJdWorkbench } from "@/components/operations/recruitment-jd/recruitment-jd-workbench";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → MASTERS → RECRUITMENT JD — the job descriptions recruiters send
 * CANDIDATES, one per role we hire for, as an original master plus a freely
 * edited recruiter copy, sent by WhatsApp or email to anyone
 * (lib/operations/recruitment-jd.ts).
 *
 * The third job-description master, and deliberately next to the other two:
 * Master JD and Person-specific JD say what a seat does once somebody is in it,
 * this one says what the seat is while we are still looking. Moved here from
 * the HR rail on 2026-09-17 at the account holder's request.
 *
 * The heading is drawn by the workbench, not here: the role dropdown sits beside
 * it and the JD below reacts to it, so they are one client island — the same
 * split as the Person-specific JD page. The loading stays here.
 *
 * ── WHO MAY DO WHAT ────────────────────────────────────────────────────────
 * Open to the Operations room to READ, like every other master — a JD we are
 * advertising is not confidential, and the people asked to refer candidates are
 * exactly the people who need to read it. Editing and sending stay HR staff
 * only, enforced in actions.ts; `canEdit` only decides whether the controls are
 * worth showing, never whether the write is allowed.
 */
export default async function RecruitmentJdMasterPage() {
  const me = await requireWorkspace("operations");
  const [data, canEdit] = await Promise.all([
    loadRecruitmentJdData(),
    canActAsHrStaff(me).catch(() => false),
  ]);

  return (
    <PageShell>
      <RecruitmentJdWorkbench
        rows={data.rows}
        sends={data.sends}
        missing={data.missing}
        canEdit={canEdit}
      />
    </PageShell>
  );
}
