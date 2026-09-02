import { redirect } from "next/navigation";
import type { Route } from "next";
import { CheckCircle2 } from "lucide-react";

import { DashboardHeader } from "@/components/layout/header";
import { DoneDashboardView } from "@/components/dashboard/done/done-dashboard-view";
import { requireUser } from "@/lib/auth/current";
import { listEmployees } from "@/lib/queries/employees";
import { loadDoneDashboard } from "@/lib/queries/done-dashboard";
import { PageShell } from "@/components/layout/page-shell";

// Same as the Task Report: the figures move whenever anything is completed, and
// a cached page that under-reports today's output is worse than a slower one.
export const dynamic = "force-dynamic";

/**
 * Completed-work analytics.
 *
 * Gated exactly like /dashboard/task-report — admins, plus anyone with at least
 * one direct report. This is a cross-team view: it names every person's output
 * and their late count, which is a manager's question. A plain doer looking at
 * their own completed work has /tasks with the same filter this page's rows
 * link to.
 */
export default async function DoneDashboardPage() {
  const me = await requireUser();

  const allEmployees = await listEmployees({ includeInactive: true });
  const hasDownline = allEmployees.some((e) => e.managerId === me.id);
  if (!(me.isAdmin || hasDownline)) {
    redirect("/dashboard" as Route);
  }

  const avatarById: Record<string, string | null> = Object.fromEntries(
    allEmployees.map((e) => [e.id, e.avatarUrl ?? null]),
  );

  const data = await loadDoneDashboard();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />

      <main>
        <PageShell as="section" width="full" py={false} className="pt-10 max-md:pt-6 pb-2">
          <div className="mt-4 flex items-center gap-3.5">
            <span
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: "linear-gradient(135deg, #059669, #047857)",
                boxShadow: "0 10px 24px -10px rgba(4,120,87,0.55)",
              }}
            >
              <CheckCircle2 size={24} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <p
                className="text-[10.5px] font-black uppercase tracking-[0.18em]"
                style={{ color: "#047857" }}
              >
                Completed work
              </p>
              <h1
                className="leading-none text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 34,
                  letterSpacing: "-0.03em",
                }}
              >
                Done Dashboard
              </h1>
            </div>
          </div>
          <p className="mt-3 text-[14.5px] font-semibold text-ink-subtle">
            Everything delivered, who delivered it, and how much of it landed on time.
          </p>
        </PageShell>

        <div className="mt-6">
          <DoneDashboardView data={data} avatarById={avatarById} />
        </div>
      </main>
    </>
  );
}
