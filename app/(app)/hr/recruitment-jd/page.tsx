import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { loadRecruitmentJdData } from "@/lib/queries/recruitment-jd";
import { RecruitmentJdWorkbench } from "@/components/hr/recruitment-jd/recruitment-jd-workbench";

export const dynamic = "force-dynamic";

/**
 * HR › RECRUITMENT JDs — the job descriptions recruiters send candidates, one
 * per candidate position, as a locked master plus a freely edited recruiter
 * copy, sent by WhatsApp or email to anyone (lib/hr/recruitment-jd.ts).
 *
 * Separate from the internal Job Description module (/operations/job-description),
 * which lists a seat's recurring duties. HR staff only.
 */
export default async function RecruitmentJdPage() {
  await requireHrStaff();
  const data = await loadRecruitmentJdData();

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <HrTitleBar title="Recruitment JDs" />
      <PageShell width="wide" py={false} className="pt-6 pb-24">
        <RecruitmentJdWorkbench rows={data.rows} sends={data.sends} missing={data.missing} />
      </PageShell>
    </div>
  );
}
