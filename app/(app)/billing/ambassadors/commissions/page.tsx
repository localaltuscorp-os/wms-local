import { DashboardHeader } from "@/components/layout/header";
import { PAGE_COMMAND_BAR_TITLE_STYLE } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { commissionLedger } from "@/lib/queries/ambassadors";
import { CommissionCenter } from "@/components/ambassadors/commission-center";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  await requireWorkspace("billing");
  const { owed, paid } = await commissionLedger();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1
            style={PAGE_COMMAND_BAR_TITLE_STYLE}
          >
            Commissions
          </h1>
        </header>

        <CommissionCenter owed={owed} paid={paid} />
      </main>
    </>
  );
}
