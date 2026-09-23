import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { OperationsCommandCenter } from "@/components/operations/operations-command-center";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { localDateString } from "@/lib/format";
import { addDays } from "@/lib/exec-calendar/grid";
import { execCalendarReady, listExecEvents } from "@/lib/queries/exec-calendar";
import { listChecklistRuns } from "@/lib/queries/operations-checklist";
import { listAmbassadors, listHhCalls, listHhEntries } from "@/lib/queries/people-allocation";
import { loadJdBank } from "@/lib/operations/jd-bank-data";

export const dynamic = "force-dynamic";

/**
 * The operations home is a command centre, not a second copy of the sidebar.
 * Each module still owns its detailed working view; this page answers what is
 * happening across the room and gives the next useful click.
 */
export default async function OperationsDashboardPage() {
  const me = await requireWorkspace("operations");
  const today = localDateString("Asia/Kolkata");
  const weekEnd = addDays(today, 6);

  const [jdBank, checklistRuns, hhEntries, hhCalls, ambassadors, calendar] = await Promise.all([
    loadJdBank(me),
    listChecklistRuns().catch(() => []),
    listHhEntries().catch(() => []),
    listHhCalls().catch(() => []),
    listAmbassadors().catch(() => []),
    execCalendarReady()
      .then((ready) => (ready ? listExecEvents(me.id, today, weekEnd).catch(() => []) : []))
      .catch(() => []),
  ]);

  const activeJds = jdBank.entries.filter((entry) => entry.isActive);
  const filledPositionIds = new Set(jdBank.holders.map((holder) => holder.positionId));
  const vacantPositions = jdBank.positions.filter((position) => !filledPositionIds.has(position.id)).length;
  const activeChecklists = checklistRuns.filter((run) => run.status === "active");
  const eventChecklists = activeChecklists.filter((run) => run.isEvent).length;
  const liveEntries = hhEntries.filter((entry) => !entry.onHold);
  const liveAmbassadors = ambassadors.filter((ambassador) => !ambassador.onHold);
  const scheduledCalls = hhCalls.filter((call) => liveEntries.some((entry) => entry.id === call.entryId));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" className="pt-6 pb-14 max-md:pt-4">
        <OperationsCommandCenter
          today={today}
          snapshot={{
            handholding: {
              people: liveEntries.length + liveAmbassadors.length,
              calls: scheduledCalls.length,
              onHold: hhEntries.filter((entry) => entry.onHold).length + ambassadors.filter((ambassador) => ambassador.onHold).length,
            },
            jobDescriptions: {
              active: activeJds.length,
              positions: jdBank.positions.length,
              vacantPositions,
              unassigned: activeJds.filter((entry) => entry.assignees.length === 0).length,
            },
            calendar: {
              scheduled: calendar.length,
              allDay: calendar.filter((event) => event.allDay).length,
            },
            checklists: {
              active: activeChecklists.length,
              eventBased: eventChecklists,
              completed: checklistRuns.filter((run) => run.status === "completed").length,
            },
          }}
        />
      </PageShell>
    </>
  );
}
