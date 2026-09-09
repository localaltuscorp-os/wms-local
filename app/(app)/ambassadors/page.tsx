import Link from "next/link";
import type { Route } from "next";
import { Plus, Users, GitBranch, Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { dashboardMetrics } from "@/lib/queries/ambassadors";
import { AmbassadorDashboard } from "@/components/ambassadors/dashboard";

export const dynamic = "force-dynamic";

export default async function AmbassadorsPage() {
  await requireWorkspace("sales");
  const metrics = await dashboardMetrics();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              Ambassadors
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px, 3.4vw, 44px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
                marginTop: 6,
              }}
            >
              Partner Intelligence
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Your referral partners, their pipeline, and the commissions they earn — at a glance.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href={"/ambassadors/directory" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <Users size={17} strokeWidth={2.6} />
              Directory
            </Link>
            <Link
              href={"/ambassadors/pipeline" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <GitBranch size={17} strokeWidth={2.6} />
              Pipeline
            </Link>
            <Link
              href={"/ambassadors/commissions" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <Wallet size={17} strokeWidth={2.6} />
              Commissions
            </Link>
            <Link
              href={"/ambassadors/new" as Route}
              className="inline-flex items-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
              }}
            >
              <Plus size={17} strokeWidth={2.6} />
              New Ambassador
            </Link>
          </div>
        </header>

        <AmbassadorDashboard metrics={metrics} />
      </main>
    </>
  );
}
