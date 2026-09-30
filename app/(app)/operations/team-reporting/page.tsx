import { Users2 } from "lucide-react";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { canEditModule } from "@/lib/permissions/resolve";
import { getHierarchy, type HierarchySnapshot } from "@/lib/queries/hierarchy";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { HierarchyBoard } from "@/components/admin/hierarchy-board";
import { TeamTransferPanel } from "@/components/operations/team-transfer-panel";
import { ManagerDesignationPanel } from "@/components/operations/manager-designation-panel";

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
    temporaryBreak: snapshot.temporaryBreak.filter((p) => keep(p.id)),
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
  const me = await requireWorkspaceAdmin("operations");

  const [rawSnapshot, canEdit] = await Promise.all([
    getHierarchy({ layout: "tree" }),
    canEditModule("admin.people.hierarchy"),
  ]);
  const snapshot = DUMMY_MODE ? withoutDummyFixtures(rawSnapshot) : rawSnapshot;

  // Hide a manager's column once their last report has left — DISPLAY ONLY.
  // getHierarchy() itself is untouched (Admin's board and any other caller
  // keeps the "always show a 2nd-level slot" behaviour); TeamTransferPanel
  // below still gets the FULL, unfiltered lists, so a hidden manager stays
  // reachable there and reappears the moment someone is transferred to them.
  const visibleColumns = snapshot.columns.filter((c) => c.managerId === null || c.reports.length > 0);

  // "Remove Manan Vasa from transfer employee button's list" (2026-09-26) —
  // he's still a valid TARGET (a manager to transfer someone TO), so only the
  // "who's being moved" list drops him, via a separate `people` array rather
  // than filtering the one `snapshot.people` everything else reads.
  const transferablePeople = snapshot.people.filter((p) => !p.isRoot);

  return (
    <PageShell width="wide">
      {/* NO body <h1> (the top bar already says "Team Reporting"). The KPI
          row replaces the old standing note + a since-removed counts strip:
          who has how many people below them, at a glance, above the board.
          Taller (2026-09-26) so it holds its own next to the two full-height
          action buttons, and the manager pills WRAP instead of scrolling
          sideways — a manager's own downline count is what "who has how many
          people below them" actually asks for, not just direct reports. */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-14 shrink-0 items-center gap-2 rounded-xl border border-hairline bg-surface-card px-4">
          <Users2 size={16} className="text-ink-subtle" />
          <span className="text-[13.5px] font-semibold text-ink-strong">
            {snapshot.people.length} {snapshot.people.length === 1 ? "employee" : "employees"} total
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {snapshot.columns
            .filter((c) => c.managerId !== null)
            .map((c) => {
              const downline = snapshot.people.find((p) => p.id === c.managerId)?.totalDownline ?? c.reports.length;
              return (
                <span
                  key={c.managerId}
                  className="flex h-14 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-hairline bg-surface-card px-3.5 text-[12.5px] font-semibold text-ink-strong"
                  title={`${downline} ${downline === 1 ? "person" : "people"} below ${c.managerName}${c.reports.length !== downline ? ` (${c.reports.length} direct)` : ""}`}
                >
                  {c.managerName}
                  <span className="rounded-pill bg-surface-soft px-1.5 py-0.5 text-[11px] font-bold text-ink-subtle">
                    {downline}
                  </span>
                </span>
              );
            })}
        </div>

        {/* Transfer and Add/Delete Manager are offered only to somebody who
            may actually write: the actions re-check, so a viewer would get a
            dialog that refuses. */}
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-2">
            <ManagerDesignationPanel people={snapshot.people} />
            <TeamTransferPanel people={transferablePeople} columns={snapshot.columns} />
          </div>
        ) : null}
      </div>

      <HierarchyBoard
        columns={visibleColumns}
        people={snapshot.people}
        canEdit={canEdit}
        showNote={false}
        compact
        grid
        enableReorder={canEdit}
        managerAccents={managerAccentsFor(snapshot)}
      />
      <section className="mt-4 rounded-xl border border-hairline bg-surface-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-[#f1f2f4] p-1.5 text-[#6b7280]"><Users2 size={14} /></span>
          <h2 className="text-[13px] font-bold text-ink-strong">Temporary Break</h2>
          <span className="text-[12px] text-ink-muted">Outside the active reporting hierarchy</span>
        </div>
        {snapshot.temporaryBreak.length ? <div className="flex flex-wrap gap-2">{snapshot.temporaryBreak.map((person) => <span key={person.id} className="rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft">{person.name}</span>)}</div> : <p className="text-[12px] text-ink-muted">No employees on Temporary Break.</p>}
      </section>
    </PageShell>
  );
}
