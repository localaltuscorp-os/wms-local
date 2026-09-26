import { DashboardHeader } from "@/components/layout/header";
import { ProjectViews } from "@/components/project-plan/project-views";
import { EMPTY_SELECTION } from "@/lib/project-plan/views";
import { attachmentCounts, listPlanTree } from "@/lib/queries/project-plan";
import { toRow } from "../plan-page";

export const dynamic = "force-dynamic";

/**
 * Project Dashboard owns the portfolio-level analytics. The hierarchy itself
 * stays in Project Views, so each navigation item has one clear purpose while
 * both surfaces still render the exact same source tree.
 */
export default async function ProjectDashboardPage() {
  const [tree, counts] = await Promise.all([listPlanTree(), attachmentCounts()]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1600px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <ProjectViews
          mode="dashboard"
          tree={tree.map(toRow)}
          initialSelection={EMPTY_SELECTION}
          attachmentCounts={Object.fromEntries(counts)}
        />
      </main>
    </>
  );
}
