import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getTrainingDashboardStats, isManager } from "@/lib/queries/training";
import { TrainingStats } from "@/components/training/dashboard/training-stats";

export const dynamic = "force-dynamic";

export default async function TrainingDashboardPage() {
  const me = await requireWorkspace("training");
  const canView = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!canView) {
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <main className="w-full px-8 max-md:px-4 pt-16 pb-16">
          <div className="mx-auto max-w-md rounded-section border border-hairline bg-surface-card p-10 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
            <p className="text-[15px] font-semibold text-ink-muted">The training dashboard is available to managers and admins.</p>
          </div>
        </main>
      </>
    );
  }

  const stats = await getTrainingDashboardStats();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1180px]">
          <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={15} /> Training Centre</Link>
          <header className="mt-3 mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Dashboard</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 800, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 4 }}>Training Progress</h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>Library reach, watch activity and test performance across the team.</p>
          </header>
          <TrainingStats stats={stats} />
        </div>
      </main>
    </>
  );
}
