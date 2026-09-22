import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { canEditModule } from "@/lib/permissions/resolve";
import { getHierarchy } from "@/lib/queries/hierarchy";
import { HierarchyBoard, HierarchyNote } from "@/components/admin/hierarchy-board";
import { TeamTransferPanel } from "@/components/operations/team-transfer-panel";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → Team Reporting.
 *
 * ── THE SAME BOARD ADMIN HAS, NOT A SECOND ONE ───────────────────────────
 * "Who reports to whom" already existed as Admin › Reporting Hierarchy, and
 * `employees.manager_id` is the one canonical answer the whole application
 * reads — every manager dashboard, team roll-up, goal cascade and approval
 * chain resolves it. So this area renders the EXISTING <HierarchyBoard> against
 * the EXISTING getHierarchy() snapshot. A separate org chart under Operations
 * would be a second place for the same fact to live, and the two would
 * eventually disagree about somebody's manager.
 *
 * ── WHY THIS IS ADMIN-GATED, AND WHAT IT WOULD TAKE TO OPEN IT ───────────
 * ADMIN, matching what the board's own server actions already enforce:
 * `moveEmployeeToManager` and `fetchManagerHistory` (app/(admin)/admin/
 * hierarchy/actions.ts) both call `requireAdmin()` on every invocation.
 *
 * A read-only version for everybody was the obvious thing to build here, and it
 * does not work: the board hides its drag handles when `canEdit` is false, but
 * it still offers each person's MANAGER HISTORY, and that fetch is admin-only.
 * A non-admin would get a board with a button that errors — worse than not
 * having the area at all. Widening this is therefore a decision about those two
 * actions, not about this page: relax the `requireAdmin()` in them to the
 * module permission and this gate can follow.
 *
 * `canEdit` is still resolved separately, so a future admin-without-the-grant
 * gets the board read-only rather than controls that fail at the action.
 */
export default async function TeamReportingPage() {
  await requireWorkspaceAdmin("operations");

  const [snapshot, canEdit] = await Promise.all([
    getHierarchy(),
    canEditModule("admin.people.hierarchy"),
  ]);

  return (
    <PageShell width="wide">
      {/* NO body <h1> (the top bar already says "Team Reporting") and NO
          counts strip: Employees / Managers / No manager restated what the
          board itself shows - a column per manager, a badge on each - and
          spent a row of the page doing it. */}
      {/* ONE ROW: the note takes the space the board leaves, the action sits at
          its right end. The note used to be below the board, which left this
          strip empty and the button floating alone above a wide gap.
          `items-center` on the ROW, never `flex` on the note itself: the note's
          children are a sentence with a <strong> in it, and making that element
          a flex container turned "past" into its own flex item — which is what
          tore the paragraph into three pieces with a gap around one word. */}
      <div className="mb-4 flex items-center gap-4">
        <HierarchyNote className="min-w-0 flex-1 text-left" />
        {/* Transfer is offered only to somebody who may actually write: the
            action re-checks, so a viewer would get a dialog that refuses. */}
        {canEdit ? (
          <div className="flex shrink-0 items-center">
            <TeamTransferPanel people={snapshot.people} columns={snapshot.columns} />
          </div>
        ) : null}
      </div>

      {/* The note is placed above by this page, so the board must not repeat it. */}
      <HierarchyBoard
        columns={snapshot.columns}
        people={snapshot.people}
        canEdit={canEdit}
        showNote={false}
        compact
      />
    </PageShell>
  );
}
