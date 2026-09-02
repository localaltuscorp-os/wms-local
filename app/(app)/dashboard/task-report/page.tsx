import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { DashboardHeader } from "@/components/layout/header";
import { TaskReportView } from "@/components/dashboard/task-report/task-report-view";
import { requireUser } from "@/lib/auth/current";
import { listEmployees } from "@/lib/queries/employees";
import { loadTaskReportData } from "@/lib/queries/task-report";
import { PageShell } from "@/components/layout/page-shell";

export const dynamic = "force-dynamic";

/**
 * Task Analytics — Manan's four task dashboards in one place:
 *   ① Done on time, by ORIGINAL due date     (12 fine aging buckets)
 *   ② Done on time, by REVISED due date       (12 fine aging buckets)
 *   ③ Not approved — person-wise + aged across the same buckets
 *   ④ Task initiator — manager→report target vs actual (3/report/working-day)
 *
 * Visibility: admins, and any MANAGER (an employee with ≥1 direct report).
 * Everyone else is redirected back to the dashboard — a plain doer has no
 * cross-team view here. Non-admin managers see only their own slices (the
 * client view filters not-approved + initiator rows to `meId`).
 *
 * LOAD-NEUTRAL: this is an on-demand route that loads its OWN data via
 * `loadTaskReportData` — it is not wired into the hot dashboard fan-out and
 * does not touch the cached dashboard aggregate.
 */
export default async function TaskReportPage() {
  const me = await requireUser();

  // Roster: drives the avatar map AND the manager check (≥1 direct report).
  const allEmployees = await listEmployees({ includeInactive: true });
  const hasDownline = allEmployees.some((e) => e.managerId === me.id);
  const canView = me.isAdmin || hasDownline;

  if (!canView) {
    // Plain doers don't get the cross-team analytics view.
    redirect("/dashboard" as Route);
  }

  const avatarById: Record<string, string | null> = Object.fromEntries(
    allEmployees.map((e) => [e.id, e.avatarUrl ?? null]),
  );

  const data = await loadTaskReportData();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />

      <main>
        {/* Page masthead + back link */}
        <PageShell as="section" width="full" py={false} className="pt-10 max-md:pt-6 pb-2">
          {/* Breadcrumb back to the dashboard, above the masthead.
              A <Link>, not a button with router.push: it renders a real <a
              href>, so it is Tab-focusable and Enter-activated for free, shows
              its destination on hover, and middle-click / ctrl-click open a new
              tab. A button reimplements the first two and loses the rest.
              `w-fit` so the hover target is the text, not the full page width. */}
          <Link
            href={"/dashboard" as Route}
            className="mb-2 flex w-fit items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft size={14} strokeWidth={2.4} aria-hidden />
            Back to Dashboard
          </Link>
          <div className="mt-4 flex items-center gap-3.5">
            <span
              className="inline-flex size-12 items-center justify-center rounded-2xl text-white shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 10px 24px -10px rgba(168,4,0,0.55)",
              }}
            >
              <BarChart3 size={24} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <p
                className="text-[10.5px] font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--color-altus-red-deep)" }}
              >
                Task Analytics
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
                Task Report
              </h1>
            </div>
          </div>
          {/* One line on md+: the max-w-[860px] cap is gone (it was what forced
              the old two-clause copy to wrap) and `whitespace-nowrap` holds it.
              Phones keep normal wrapping — a nowrap line there would either
              overflow the viewport or need truncating, and a half-sentence is
              worse than two rows.
              The old copy said "twelve early/late buckets"; there are NINE
              (FINE_AGING_BUCKETS), so that count went with it. */}
          <p className="mt-3 text-[14.5px] font-semibold text-ink-subtle max-md:whitespace-normal md:whitespace-nowrap">
            Delivery punctuality, sent-back work, and delegation throughput across early/late buckets.
          </p>
        </PageShell>

        <div className="mt-6">
          <TaskReportView
            data={data}
            avatarById={avatarById}
            isAdmin={Boolean(me.isAdmin)}
            meId={me.id}
          />
        </div>
      </main>

    </>
  );
}
