import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { getThisWeekShare, listSharesForFeedback, listSelfLearning } from "@/lib/queries/learning";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { canManageTraining } from "@/lib/training/roles";
import { upcomingShares } from "@/lib/queries/share-schedule";
import { ShareForm } from "@/components/training/learning/share-form";
import { ShareFeed } from "@/components/training/learning/share-feed";
import { ShareScheduleBoard } from "@/components/training/share/share-schedule-board";

export const dynamic = "force-dynamic";

export default async function WeeklySharePage() {
  const me = await requireWorkspace("training");
  const weekLabel = formatWeekLabel(currentWeekStart());
  const from90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const toToday = new Date().toISOString().slice(0, 10);

  const [mine, feed, employeeOptions, schedule, canManage, myLearning] = await Promise.all([
    getThisWeekShare(me.id),
    listSharesForFeedback({ excludeEmployeeId: me.id, limit: 24 }),
    listEmployeeOptions(),
    upcomingShares(12),
    canManageTraining(me),
    listSelfLearning(me.id, from90, toToday),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <PageCommandBar title="Share & Learn" />

        <div className="mb-3 rounded-xl border border-hairline bg-surface-card p-3">
          <h2 className="text-[14px] font-bold text-ink-strong">Daily Learning Share Schedule</h2>
          <p className="mt-0.5 mb-3 text-[12.5px] font-medium text-ink-subtle">Juniors 1:30 PM · Team Leads 1:40 PM.</p>
          <ShareScheduleBoard rows={schedule} employeeOptions={employeeOptions} canManage={canManage} meId={me.id} meName={me.name} />
        </div>

        <div className="grid grid-cols-5 gap-4 max-lg:grid-cols-1">
          {/* This week's Share form */}
          <section className="col-span-2 max-lg:col-span-1">
            <div className="wg-rise rounded-xl border border-hairline bg-surface-card p-3 shadow-sm" style={{ animationDelay: "0ms" }}>
              <h2 className="text-[15px] font-bold text-ink-strong">Your Share This Week</h2>
              <p className="mt-0.5 mb-3 text-[12.5px] font-medium text-ink-subtle">{weekLabel}</p>
              <ShareForm existing={mine} weekLabel={weekLabel} mySelfLearning={myLearning.map((s) => ({ id: s.id, title: s.title }))} />
            </div>
          </section>

          {/* Peer-feedback feed */}
          <section className="col-span-3 max-lg:col-span-1">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-ink-strong" style={{ letterSpacing: "-0.01em" }}>
                  Recent Colleague Shares
                </h2>
              </div>
            </div>
            <ShareFeed shares={feed} />
          </section>
        </div>
      </main>
    </>
  );
}
