import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { PageTitle } from "@/components/layout/page-title";
import { ReviewWorkbench } from "@/components/goals/review/review-workbench";
import { ReviewControls } from "@/components/goals/review/review-controls";
import { loadReviewData } from "@/app/(app)/goals/review/review-data";

export const dynamic = "force-dynamic";

/**
 * WMS Review uses the Goals review workbench while retaining WMS navigation.
 */
export default async function WmsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; fy?: string }>;
}) {
  const sp = await searchParams;
  const data = await loadReviewData({ emp: sp.emp, fy: sp.fy });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <PageTitle title="Review & Scores" />
        <ReviewWorkbench
          data={data}
          headerControls={
            <ReviewControls
              roster={data.roster}
              viewedEmployeeId={data.viewedEmployeeId}
              viewedName={data.viewedName}
              myEmployeeId={data.myEmployeeId}
              fyStartYear={data.fyStartYear}
              basePath="/review"
            />
          }
        />
      </PageShell>
    </>
  );
}
