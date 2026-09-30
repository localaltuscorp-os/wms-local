import Link from "next/link";
import type { Route } from "next";
import { Plus, Users, GitBranch, Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PAGE_COMMAND_BAR_TITLE_STYLE } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { dashboardMetrics } from "@/lib/queries/ambassadors";
import { AmbassadorDashboard } from "@/components/ambassadors/dashboard";

export const dynamic = "force-dynamic";

export default async function AmbassadorsPage() {
  await requireWorkspace("billing");
  const metrics = await dashboardMetrics();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1
              style={PAGE_COMMAND_BAR_TITLE_STYLE}
            >
              Partner Intelligence
            </h1>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href={"/billing/ambassadors/directory" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <Users size={17} strokeWidth={2.6} />
              Directory
            </Link>
            <Link
              href={"/billing/ambassadors/pipeline" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <GitBranch size={17} strokeWidth={2.6} />
              Pipeline
            </Link>
            <Link
              href={"/billing/ambassadors/commissions" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <Wallet size={17} strokeWidth={2.6} />
              Commissions
            </Link>
            <Link
              href={"/billing/ambassadors/new" as Route}
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
