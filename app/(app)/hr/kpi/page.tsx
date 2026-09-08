import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { loadKpiRoster } from "@/app/(app)/hr/kpi/actions";
import { KpiWorkbench } from "@/components/hr/kpi/kpi-workbench";
import { currentQuarter } from "@/lib/hr/kpi/quarter";
import { kpiNotificationsOn } from "@/lib/hr/kpi/flag";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * KPI Management (`/hr/kpi`) — HR-STAFF-ONLY. Pick an employee + quarter, then
 * assign / edit their KPIs (chosen from the appraisal KPI dictionary or entered
 * manually), toggle "Applicable this quarter", activate/deactivate and review a
 * full append-only change history. Every change composes an employee email —
 * gated OFF by default (KPI_NOTIFICATIONS_ON), so nothing sends until enabled.
 *
 * Full-screen focused surface (no rail) — its own back button navigates home.
 */
export default async function KpiManagementPage() {
  await requireHrStaff();
  const roster = await loadKpiRoster().catch(() => []);

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <HrTitleBar
      />

      <PageShell width="standard" py={false} className="pt-8 pb-24">
        <KpiWorkbench
          roster={roster}
          initialQuarter={currentQuarter()}
          notificationsOn={kpiNotificationsOn()}
        />
      </PageShell>
    </div>
  );
}
