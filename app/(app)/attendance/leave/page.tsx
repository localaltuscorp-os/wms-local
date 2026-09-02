import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import {
  getLeaveBalance,
  listMyLeave,
  listPendingLeave,
} from "@/lib/queries/leave";
import { localDateString } from "@/lib/format";
import { LeaveBalanceCard } from "@/components/attendance/leave/leave-balance-card";
import { RequestLeaveForm } from "@/components/attendance/leave/request-leave-form";
import { LeaveList } from "@/components/attendance/leave/leave-list";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const me = await requireUser();
  const today = localDateString("Asia/Kolkata");

  const [balance, mine, pending] = await Promise.all([
    getLeaveBalance(me.id, today),
    listMyLeave(me.id),
    me.isAdmin ? listPendingLeave() : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">Leave</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Request paid or unpaid leave and track approvals.
          </p>
        </header>

        <div className="space-y-6">
          <LeaveBalanceCard balance={balance} />
          <RequestLeaveForm today={today} />

          {me.isAdmin && (
            <section>
              <h2 className="text-[18px] font-semibold text-ink-strong mb-3">
                Pending approvals
                {pending.length > 0 && (
                  <span className="ml-2 text-[14px] font-normal text-ink-subtle tabular-nums">
                    {pending.length}
                  </span>
                )}
              </h2>
              <LeaveList rows={pending} mode="pending" />
            </section>
          )}

          <section>
            <h2 className="text-[18px] font-semibold text-ink-strong mb-3">
              My requests
            </h2>
            <LeaveList rows={mine} mode="mine" />
          </section>
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
