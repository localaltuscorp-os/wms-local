import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { canEditModule } from "@/lib/permissions/resolve";
import { getHierarchy, type HierarchySnapshot } from "@/lib/queries/hierarchy";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { HierarchyBoard, HierarchyNote } from "@/components/admin/hierarchy-board";
import { TeamTransferPanel } from "@/components/operations/team-transfer-panel";

/**
 * The fixture people the local dummy database seeds for every OTHER module
 * (tasks, clients, goals…) — ids from scripts/dummy-db-seed.ts.
 *
 * Team Reporting is tested against a real org chart instead, so they are kept
 * off THIS board only. Every other module still sees them, which is the point:
 * nothing else in dummy mode changes shape.
 *
 * `DUMMY_MODE` is false in any production build (lib/db/dummy-dir.ts), so this
 * filter cannot remove anybody from the real board. And no production employee
 * can carry one of these ids: they are hand-written all-zero UUIDs that
 * `gen_random_uuid()` never produces.
 */
const DUMMY_FIXTURE_IDS = new Set([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
]);

function withoutDummyFixtures(snapshot: HierarchySnapshot): HierarchySnapshot {
  const keep = (id: string) => !DUMMY_FIXTURE_IDS.has(id);
  const columns = snapshot.columns
    .filter((c) => c.managerId === null || keep(c.managerId))
    .map((c) => ({ ...c, reports: c.reports.filter((p) => keep(p.id)) }));
  const unassigned = columns.find((c) => c.managerId === null)?.reports ?? [];
  return {
    people: snapshot.people.filter((p) => keep(p.id)),
    columns,
    unassignedCount: unassigned.filter((p) => p.reportCount === 0).length,
  };
}

/**
 * Team Reporting colours (2026-09): each manager's box OUTLINE and HEADING text.
 * Matched on the manager's FIRST NAME (case-insensitive), because that is how the
 * board names them; a manager not listed here — and the "No manager assigned"
 * column — keeps the default look. Rename a manager's first name and their
 * colour needs updating here.
 */
const BLACK = "#111111";
const RED = "#E10600";
const LIGHT_GRAY = "#9CA3AF";
const DARK_GRAY = "#4B5563";
const MANAGER_ACCENTS: Record<string, string> = {
  manan: BLACK,
  rohan: RED,
  mitul: RED,
  ruchita: LIGHT_GRAY,
  rashmi: LIGHT_GRAY,
  rutvisha: LIGHT_GRAY,
  jeevan: DARK_GRAY,
  mohit: DARK_GRAY,
};

/** managerId → colour, for the columns whose manager has one. */
function managerAccentsFor(snapshot: HierarchySnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of snapshot.columns) {
    if (!c.managerId) continue;
    const first = c.managerName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const color = MANAGER_ACCENTS[first];
    if (color) out[c.managerId] = color;
  }
  return out;
}

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

  const [rawSnapshot, canEdit] = await Promise.all([
    getHierarchy({ layout: "tree" }),
    canEditModule("admin.people.hierarchy"),
  ]);
  const snapshot = DUMMY_MODE ? withoutDummyFixtures(rawSnapshot) : rawSnapshot;

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
        grid
        managerAccents={managerAccentsFor(snapshot)}
      />
    </PageShell>
  );
}
