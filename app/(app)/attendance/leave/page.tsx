import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import {
  getLeaveBalance,
  listMyLeave,
  leaveReviewScopeFor,
  countPendingLeaveForReview,
} from "@/lib/queries/leave";
import { localDateString } from "@/lib/format";
import { asWorkerType } from "@/lib/attendance/worker-type";
import { allowedLeaveKinds } from "@/lib/attendance/leave-eligibility";
import { listLeaveCategories } from "@/lib/attendance/leave-categories";
import { LeaveSummaryCards } from "@/components/attendance/leave/leave-summary-cards";
import { ApplyLeaveDialog } from "@/components/attendance/leave/apply-leave-dialog";
import { MyLeaveTable } from "@/components/attendance/leave/my-leave-table";

export const dynamic = "force-dynamic";

/**
 * The EMPLOYEE's leave surface (spec §2). Deliberately three things and nothing
 * more: the summary numbers, the apply button, and the list of what you asked
 * for. The reviewing side of the feature lives at ./requests — a queue is a
 * different job from a personal record, and putting the two on one page is what
 * made the old version of this page a dashboard.
 */
export default async function LeavePage() {
  const me = await requireUser();
  const today = localDateString(me.timezone || "Asia/Kolkata");
  const workerType = asWorkerType(me.workerType);

  const [balance, mine, scope, categories] = await Promise.all([
    getLeaveBalance(me.id, today),
    listMyLeave(me.id),
    leaveReviewScopeFor(me),
    listLeaveCategories(),
  ]);

  // A reviewer landing on their own leave page still needs the door to the
  // queue — but only when there is something in it.
  const pending = scope.canReview
    ? await countPendingLeaveForReview(scope)
    : { requests: 0, employees: 0 };

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="narrow">
        <PageCommandBar
          title="Leave"
          hint={
            balance.paidEligible
              ? `Paid and unpaid leave · ${balance.cycleLabel}`
              : "Unpaid leave"
          }
          actions={
            <div className="flex items-center gap-2">
              {pending.requests > 0 && (
                <Link
                  href={"/attendance/leave/requests" as Route}
                  className="wg-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink-strong"
                  style={{ border: "1px solid var(--color-hairline)" }}
                >
                  Review {pending.requests}
                  <ArrowRight size={13} strokeWidth={2.6} />
                </Link>
              )}
              <ApplyLeaveDialog
                today={today}
                allowedKinds={allowedLeaveKinds(workerType)}
                paidRemaining={balance.remaining}
                paidEligible={balance.paidEligible}
                allowance={balance.allowance}
                cycleLabel={balance.cycleLabel}
                beforeProbation={balance.beforeProbation}
                categories={categories}
              />
            </div>
          }
        />

        <LeaveSummaryCards balance={balance} />

        <section className="mt-6" aria-labelledby="my-leave-heading">
          <h2
            id="my-leave-heading"
            className="mb-2.5 text-[15px] font-bold text-ink-strong"
          >
            My Leave Requests
          </h2>
          <MyLeaveTable rows={mine} />
        </section>
      </PageShell>
    </>
  );
}
