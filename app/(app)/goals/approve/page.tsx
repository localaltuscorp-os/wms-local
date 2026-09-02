import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import {
  PageCommandBar,
  COMMAND_PAGE_CLASS,
} from "@/components/layout/page-command-bar";
import { requireGoalsAccess } from "@/lib/goals/access";
import { loadApproveBoard } from "@/components/goals/approve/data";
import { currentWeekStart, prevWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { ApproveWorkbench } from "@/components/goals/approve/approve-workbench";

export const dynamic = "force-dynamic";

/**
 * Monday manager-approval surface (Module 3, design §6 / §11b(B)).
 *
 * A manager sees each active downline member's LAST-week progress (review +
 * approve) and THIS-week committed goals (approve, fill-on-behalf, or require a
 * change), stamping `approved_by_manager_at`. When every downline member's
 * last-week + this-week adopted rows are approved, the Monday clock-in gate
 * (`managerApproveSatisfied`) is satisfied.
 *
 * Access is re-asserted here (layout gates are unreliable on prod). The read is
 * fail-safe — a DB hiccup renders an empty roster rather than throwing.
 */
export default async function GoalsApprovePage() {
  const { me } = await requireGoalsAccess();

  // The canvas (and its ?ritual= contextual state) is retired — this page IS
  // the Monday approval surface again in both flag states. Every nav pill,
  // inbox goals_approval_reminder and punch-gate deep-link keeps working.
  const weekStart = currentWeekStart();
  const lastWeek = prevWeekStart(weekStart);

  const { members, monday } = await loadApproveBoard(me.id, weekStart, lastWeek);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className={COMMAND_PAGE_CLASS}>
        <PageCommandBar
          title="Approve your team's week"
          hint="Sign off last week's progress and this week's goals for each of your reports."
        />

        <ApproveWorkbench
          members={members}
          weekStart={weekStart}
          lastWeekStart={lastWeek}
          weekLabel={formatWeekLabel(weekStart)}
          lastWeekLabel={formatWeekLabel(lastWeek)}
          isMonday={monday}
        />
      </PageShell>
    </>
  );
}

// Board loader extracted VERBATIM to components/goals/approve/data.ts (Phase 6)
// so the canvas RitualBanner's lazy action reads the exact same downline board.
