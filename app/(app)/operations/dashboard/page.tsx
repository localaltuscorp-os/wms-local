import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { OperationsCommandCenter } from "@/components/operations/operations-command-center";
import { getCurrentEmployee } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { addDays } from "@/lib/exec-calendar/grid";
import { execCalendarReady, listExecEvents } from "@/lib/queries/exec-calendar";
import { listChecklistRuns } from "@/lib/queries/operations-checklist";
import { listAmbassadors, listHhCalls, listHhEntries } from "@/lib/queries/people-allocation";
import { loadJdBank } from "@/lib/operations/jd-bank-data";

export const dynamic = "force-dynamic";

type OperationsSnapshot = React.ComponentProps<typeof OperationsCommandCenter>["snapshot"];

/**
 * This page is an overview, so it must remain usable when one of the optional
 * Operations sources is temporarily unavailable (or carries an older dummy
 * row shape).  The detailed pages remain the source of truth; here we prefer a
 * visible empty section to failing the complete dashboard.
 */
function emptySnapshot(): OperationsSnapshot {
  return {
    handholding: { people: 0, calls: 0, onHold: 0, upcomingCalls: [] },
    jobDescriptions: { active: 0, positions: 0, vacantPositions: 0, unassigned: 0, available: false },
    calendar: { scheduled: 0, allDay: 0, events: [] },
    checklists: { active: 0, eventBased: 0, completed: 0, recent: [] },
  };
}

/**
 * The operations home is a command centre, not a second copy of the sidebar.
 * Each module still owns its detailed working view; this page answers what is
 * happening across the room and gives the next useful click.
 */
export default async function OperationsDashboardPage() {
  // The shared `(app)` layout has already authenticated and authorised this
  // route. Reusing its request-cached identity avoids a second access lookup
  // being able to take an otherwise healthy dashboard down.
  const me = await getCurrentEmployee();
  const today = localDateString("Asia/Kolkata");
  const weekEnd = addDays(today, 6);
  let snapshot = emptySnapshot();

  if (me) try {
    const [jdBank, checklistRuns, hhEntries, hhCalls, ambassadors, calendar] = await Promise.all([
    // The dashboard is an overview; a temporarily unavailable JD source must
    // not replace every other Operations area with the database error screen.
    // We keep the section visible with an explicit unavailable state below.
    loadJdBank(me).catch(() => null),
    listChecklistRuns().catch(() => []),
    listHhEntries().catch(() => []),
    listHhCalls().catch(() => []),
    listAmbassadors().catch(() => []),
    execCalendarReady()
      .then((ready) => (ready ? listExecEvents(me.id, today, weekEnd).catch(() => []) : []))
      .catch(() => []),
    ]);

    const activeJds = (jdBank?.entries ?? []).filter((entry) => entry.isActive);
    const filledPositionIds = new Set((jdBank?.holders ?? []).map((holder) => holder.positionId));
    const vacantPositions = (jdBank?.positions ?? []).filter((position) => !filledPositionIds.has(position.id)).length;
    const activeChecklists = checklistRuns.filter((run) => run.status === "active");
    const eventChecklists = activeChecklists.filter((run) => run.isEvent).length;
    const liveEntries = hhEntries.filter((entry) => !entry.onHold);
    const liveAmbassadors = ambassadors.filter((ambassador) => !ambassador.onHold);
    const scheduledCalls = hhCalls.filter((call) => liveEntries.some((entry) => entry.id === call.entryId));
    const supportNameById = new Map(liveEntries.map((entry) => [entry.id, entry.name]));

    snapshot = {
      handholding: {
        people: liveEntries.length + liveAmbassadors.length,
        calls: scheduledCalls.length,
        onHold: hhEntries.filter((entry) => entry.onHold).length + ambassadors.filter((ambassador) => ambassador.onHold).length,
        upcomingCalls: scheduledCalls
          .filter((call) => typeof call.day === "string" && call.day >= today)
          .sort((a, b) => a.day.localeCompare(b.day) || a.seq - b.seq)
          .slice(0, 8)
          .map((call) => ({
            id: call.id,
            name: supportNameById.get(call.entryId) ?? "Hand-holding participant",
            day: call.day,
            callType: call.callType ?? "",
            durationMin: Number.isFinite(call.durationMin) ? call.durationMin : 0,
          })),
      },
      jobDescriptions: {
        active: activeJds.length,
        positions: jdBank?.positions.length ?? 0,
        vacantPositions,
        unassigned: activeJds.filter((entry) => !(entry.assignees ?? []).length).length,
        available: jdBank !== null,
      },
      calendar: {
        scheduled: calendar.length,
        allDay: calendar.filter((event) => event.allDay).length,
        events: calendar
          .filter((event) => typeof event.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.day))
          .map((event) => ({
            id: event.id,
            title: event.title || "Untitled event",
            day: event.day,
            allDay: Boolean(event.allDay),
            startMin: Number.isFinite(event.startMin) ? event.startMin : null,
          })),
      },
      checklists: {
        active: activeChecklists.length,
        eventBased: eventChecklists,
        completed: checklistRuns.filter((run) => run.status === "completed").length,
        recent: checklistRuns.slice(0, 8).map((run) => ({
          id: run.id,
          title: run.title || "Untitled checklist",
          date: typeof run.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(run.eventDate) ? run.eventDate : null,
          status: run.status,
          isEvent: Boolean(run.isEvent),
        })),
      },
    };

  } catch (error) {
    // Keep a genuine server-side record while making this overview fail soft.
    console.error("[operations dashboard] snapshot failed; rendering safe empty state", error);
  }

  return <OperationsDashboard today={today} snapshot={snapshot} />;
}

function OperationsDashboard({ today, snapshot }: { today: string; snapshot: OperationsSnapshot }) {
  return <><DashboardHeader generatedAt={new Date()} /><PageShell width="full" className="pt-6 pb-14 max-md:pt-4"><OperationsCommandCenter today={today} snapshot={snapshot} /></PageShell></>;
}
