import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { COMMAND_PAGE_CLASS } from "@/components/layout/page-command-bar";
import { requireGoalsAccess } from "@/lib/goals/access";
import { loadApproveBoard, loadApprovePreviewBoard } from "@/components/goals/approve/data";
import { currentWeekStart, prevWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { ApproveWorkbench } from "@/components/goals/approve/approve-workbench";
import type { ApproveGoal, ApproveMember } from "@/components/goals/approve/types";

export const dynamic = "force-dynamic";

function previewGoal(id: string, employeeId: string, weekStart: string, subject: string, pctDone: number, approved = false): ApproveGoal {
  return {
    id, employeeId, weekStart, subject, pctDone, approved,
    position: 0, client: null, area: "Operations", uom: null, targetDone: null,
    notes: null, status: pctDone === 100 ? "done" : "initiated", acceptPct: approved ? pctDone : null,
    reviewNotes: approved ? "Progress verified." : null, targetQty: null, actualQty: null,
    targetAmount: null, actualAmount: null, teamDependencyPct: null, evidenceUrl: null,
    linkUrl: null, committed: true,
  };
}

/** Local-preview-only sample, never enabled in production or when real reports exist. */
function previewMembers(weekStart: string, lastWeek: string): ApproveMember[] {
  const employeeId = "00000000-0000-4000-8000-000000000101";
  return [{
    id: employeeId,
    name: "Preview Team Member",
    lastWeek: [
      previewGoal("00000000-0000-4000-8000-000000000201", employeeId, lastWeek, "Close pending client follow-ups", 80),
      previewGoal("00000000-0000-4000-8000-000000000202", employeeId, lastWeek, "Publish weekly operations report", 100, true),
    ],
    thisWeek: [
      previewGoal("00000000-0000-4000-8000-000000000203", employeeId, weekStart, "Prepare the team delivery plan", 0),
      previewGoal("00000000-0000-4000-8000-000000000204", employeeId, weekStart, "Resolve priority customer requests", 0),
    ],
  }];
}

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

  const { members: liveMembers, monday } = await loadApproveBoard(me.id, weekStart, lastWeek);
  const members =
    liveMembers.length === 0 && process.env.NODE_ENV !== "production" && process.env.DISABLE_AUTH === "true"
      ? await loadApprovePreviewBoard(weekStart, lastWeek)
      : liveMembers;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className={COMMAND_PAGE_CLASS}>
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
