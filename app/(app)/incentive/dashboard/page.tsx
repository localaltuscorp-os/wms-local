import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { IncentiveDashboard } from "@/components/incentive/incentive-dashboard";
import { requireUser } from "@/lib/auth/current";
import { incentiveDashboard } from "@/lib/queries/incentive";

export const dynamic = "force-dynamic";

export default async function IncentiveDashboardPage() {
  const me = await requireUser();
  const data = await incentiveDashboard();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <IncentiveDashboard data={data} myId={me.id} />
      <DashboardFooter />
    </>
  );
}
