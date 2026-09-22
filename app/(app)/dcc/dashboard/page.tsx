import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { addDays, shortDay } from "@/lib/compliance/schedule";
import { loadComplianceBoard } from "@/lib/queries/compliance-board";
import { computeComplianceDashboard } from "@/lib/compliance/dashboard";
import { ScopePicker } from "@/components/compliance/compliance-controls";
import { ComplianceDashboardView } from "@/components/compliance/dashboard/compliance-dashboard-view";

export const dynamic = "force-dynamic";

/**
 * DCC → DASHBOARD — THE WCC / MCC BOARD.
 *
 * ── WHAT THIS PAGE USED TO BE, AND WHY IT IS NOT THAT ANY MORE ─────────────
 * Until 2026-09-21 this page was Jeevan's SP1 call sheet: a typed-into
 * Monday→Saturday grid, plus call-mix / heatmap / performer sections around it,
 * carrying an instruction from 2026-09-17 that "the dashboard of daily
 * compliance will be like SP1 google sheet". `/dcc/sp1` and `/dcc/call-log`
 * were folded into it and still redirect here.
 *
 * That instruction was superseded on 2026-09-21: DCC's daily board had already
 * become WCC and MCC (see lib/dcc/nav.ts), and the module's Dashboard was still
 * reporting on a sheet that was no longer where the work was recorded. The
 * page was cleared and rebuilt on the checklists — asked for explicitly, and
 * after the older instruction was put back on the table.
 *
 * The SP1 modules themselves (lib/dcc/sp1.ts, lib/queries/dcc-sp1.ts,
 * components/dcc/sp1/*) are deliberately LEFT ON DISK and merely unreferenced
 * from here: the 10 pm DCC report and the Android app still read
 * `dcc_entries.status`, and deleting a subsystem to tidy a page is how a
 * working cron job dies quietly three weeks later.
 *
 * ── THE WINDOW ────────────────────────────────────────────────────────────
 * One window, two checklists, measured the way each is actually kept: WCC over
 * the last seven days of deadlines, MCC over the current month. A single day
 * count across both would be wrong for a monthly compliance, where seven days
 * either includes its one deadline or none of them and the rate swings between
 * 0% and 100% on nothing.
 */
export default async function DccDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = localDateString("Asia/Kolkata");
  const from = addDays(today, -6);
  const monthKey = today.slice(0, 7);

  // Both boards in parallel, through the SAME loader the WCC and MCC tables
  // use — scope, visibility and row-building included, so the dashboard cannot
  // show a person or a row those tables would have hidden.
  const [wcc, mcc] = await Promise.all([
    loadComplianceBoard({
      me,
      kind: "wcc",
      who: sp.who,
      today,
      from,
      to: today,
      personalGroup: "day",
    }),
    loadComplianceBoard({
      me,
      kind: "mcc",
      who: sp.who,
      today,
      monthKeys: [monthKey],
      personalGroup: "month",
    }),
  ]);

  const data = computeComplianceDashboard(wcc.rows, mcc.rows);

  const monthLabel = new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <ComplianceDashboardView
      data={data}
      windowLabel={`${shortDay(from)} – ${shortDay(today)} · ${monthLabel}`}
      scopePicker={<ScopePicker picker={wcc.picker} who={wcc.who} meId={me.id} />}
      who={wcc.who}
    />
  );
}
