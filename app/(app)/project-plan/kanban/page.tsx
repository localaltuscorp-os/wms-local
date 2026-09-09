import { PlanPage } from "../plan-page";

export const dynamic = "force-dynamic";

/**
 * Project Plan — Kanban.
 *
 * The SAME page as every level route, opened on the board instead of the table.
 * That is the whole implementation, and it is deliberate: brief §11 asks that
 * Kanban be the project hierarchy seen as columns, not a second screen with its
 * own data. Sharing the page means it shares the tree, the search, the project
 * filter and the level pill — switch to List and you are looking at exactly the
 * rows you were just looking at as cards.
 *
 * WHAT MOVES WHEN A CARD MOVES. Every card is a row that already exists, and
 * dragging one writes to that row through the same actions the table uses:
 *
 *   Action / Sub-Action in WMS   `setTaskStatus` — the ONE `tasks` record WMS
 *                                lists and the Google Calendar syncs, so the
 *                                card moves on the WMS board too.
 *   Project / Milestone / Result `setPlanNodeStatus` — project_nodes.status,
 *                                after the same permission check the picker in
 *                                the table runs.
 *
 * There is no kanban-shaped copy of anything.
 *
 * (This route previously rendered the WMS `<KanbanBoard>` filtered to
 * plan-linked tasks. That board still exists, unchanged, at /tasks/kanban —
 * which is where a task-shaped view of tasks belongs. Here it could only show
 * the executable third of the plan, leaving a Milestone someone had marked
 * Follow Up with nowhere on the module's own board to appear.)
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <PlanPage level="projects" view="kanban" searchParams={sp} />;
}
