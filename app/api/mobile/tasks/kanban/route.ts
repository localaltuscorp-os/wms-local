import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listBoardTasks } from "@/lib/queries/tasks";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  ARCHIVE_COL,
  resolveAdminColumnOrder,
  USER_COLUMN_ORDER,
  type ColId,
} from "@/lib/kanban-columns";
import type { TaskListFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/tasks/kanban — the signed-in user's OWN tasks, grouped by the
 * status board columns (the mobile rendition of the web /tasks/kanban board,
 * which on web is admin-and-everyone but here is owner-scoped so a doer/manager
 * sees their lane).
 *
 * The board reuses `listBoardTasks` (the exact query the web board is built
 * from) narrowed to `doerId = me`, plus the server `statusDisplay` map (label +
 * colour token per status, never a client-side hex) and the same `columnOrder`
 * the web resolves (admin → org's saved order, everyone else → the curated
 * list). Archived tasks live ONLY in the synthetic Archived column and are
 * dropped from their status column, mirroring `KanbanBoard`'s grouping.
 *
 * Read-only + additive: no existing web path changes.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: MOBILE_CORS },
    );
  }
  const me = auth.employee;

  // Owner-scoped, unbounded date range so the board shows the doer's whole
  // lane (the board query never applies `archived`, so the Archived column is
  // populated too — the client routes archived cards there).
  const filters: TaskListFilters = {
    startDate: null,
    endDate: null,
    statuses: [],
    doerIds: [me.id],
    initiatorIds: [],
    departments: [],
    priorities: [],
    subjects: [],
    clients: [],
    taskId: null,
    archived: false,
    activityType: null,
    overdue: false,
    unread: false,
    ageRange: null,
    assigneeMode: "specific",
      teams: [],
      viewerId: null,
  };

  const [tasks, statusDisplay] = await Promise.all([
    listBoardTasks(filters),
    getStatusDisplayMap(),
  ]);

  // Same column order the web page resolves: admins get the org's saved,
  // de-duped, live-column-completed order; everyone else the curated list.
  let columns: ColId[];
  if (me.isAdmin) {
    const org = await getOrgSettings();
    columns = resolveAdminColumnOrder(org.boardColumnOrder);
  } else {
    columns = USER_COLUMN_ORDER;
  }

  return NextResponse.json(
    {
      // The synthetic Archived column sentinel, so the client can label it
      // without hard-coding the string.
      archiveColumnId: ARCHIVE_COL,
      columns,
      statusDisplay,
      tasks: tasks.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        subject: t.subject,
        client: t.client,
        status: t.status,
        priority: t.priority,
        archived: t.archived,
        // Wrap in new Date() so a cache-HIT ISO string and a live Date both
        // serialise identically — no string/Date drift on the wire.
        dueAt: new Date(t.dueAt).toISOString(),
        updatedAt: new Date(t.updatedAt).toISOString(),
        completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
      })),
    },
    { headers: MOBILE_CORS },
  );
}
