import { DashboardHeader } from "@/components/layout/header";
import { PAGE_COMMAND_BAR_TITLE_STYLE } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import {
  listReferrals,
  listAmbassadors,
  listAmbProducts,
} from "@/lib/queries/ambassadors";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { PipelineBoard } from "@/components/ambassadors/pipeline-board";

export const dynamic = "force-dynamic";

export default async function AmbassadorPipelinePage() {
  await requireWorkspace("billing");

  const [referrals, ambassadors, products, employees] = await Promise.all([
    listReferrals(),
    listAmbassadors(),
    listAmbProducts(),
    listEmployeeOptions(),
  ]);

  const ambassadorOptions = ambassadors.map((a) => ({ id: a.id, name: a.name }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1
            style={PAGE_COMMAND_BAR_TITLE_STYLE}
          >
            Pipeline
          </h1>
        </header>

        <PipelineBoard
          referrals={referrals}
          ambassadors={ambassadorOptions}
          products={products}
          employees={employees}
        />
      </main>
    </>
  );
}
