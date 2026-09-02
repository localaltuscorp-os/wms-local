import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { loadKpiRoster } from "@/app/(app)/hr/kpi/actions";
import { KpiWorkbench } from "@/components/hr/kpi/kpi-workbench";
import { currentQuarter } from "@/lib/hr/kpi/quarter";
import { kpiNotificationsOn } from "@/lib/hr/kpi/flag";

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
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{
              background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)",
              boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Back to HR</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <span className="justify-self-center truncate text-[15px] font-extrabold tracking-tight text-ink-strong">
          KPI Management
        </span>
        <span aria-hidden className="justify-self-end" />
      </header>

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
