import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listTasks } from "@/lib/queries/tasks";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { isDoneLate } from "@/lib/task-late";
import type { TaskListFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** yyyy-mm-dd for a Date in IST (lexicographic order == chronological). */
function istYmd(d: Date): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/team/agenda — the "My Day" agenda for the SIGNED-IN user, the
 * mobile rendition of the web `/tasks/agenda` page (owner-scoped by default,
 * exactly like the web which seeds `defaultDoerId: me.id`). Returns the same
 * filtered rows the List view uses, each reduced to an agenda card (taskNo,
 * title, subject, client, status, priority, doerName, IST due-day + `late`),
 * the six upcoming day columns (Today · Tomorrow · weekday…), the four
 * lifecycle bucket counts (Due Now · Upcoming · Overdue · Not Due) and the
 * server `statusDisplay` map so the app never hard-codes a status label/colour.
 * Additive + read-only: reuses the web's own `listTasks` query and never
 * touches the web surface.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  // Owner-scoped to the signed-in user (as doer), non-archived — the same
  // default the web "My Day" page resolves via parseTaskFilters(defaultDoerId).
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
    assigneeMode: "default",
      teams: [],
      viewerId: null,
  };

  const [rows, statusDisplay] = await Promise.all([listTasks(filters), getStatusDisplayMap()]);

  const now = new Date();
  const todayYmd = istYmd(now);
  // Six upcoming day columns, today first (IST) — mirrors the web agenda window.
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() + i * MS_PER_DAY);
    const ymd = istYmd(d);
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
    const sub = d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: TZ });
    return { ymd, label, sub };
  });

  const tasks = rows.map((r) => ({
    id: r.id,
    taskNo: r.taskNo,
    title: r.title,
    subject: r.subject,
    client: r.client,
    status: r.status,
    priority: r.priority,
    doerName: r.doerName,
    // r.dueAt is the EFFECTIVE due (revised ?? original) Date from listTasks.
    dueYmd: istYmd(new Date(r.dueAt)),
    late: isDoneLate({ status: r.status, completedAt: r.completedAt, dueAt: r.dueAt }),
  }));

  // Lifecycle buckets — window-independent so labels stay stable (mirrors the
  // web AgendaBoard): Overdue < today, Due Now = today, Upcoming = next 7 days,
  // Not Due = beyond.
  const horizon = istYmd(new Date(now.getTime() + 7 * MS_PER_DAY));
  const stats = {
    dueNow: tasks.filter((t) => t.dueYmd === todayYmd).length,
    upcoming: tasks.filter((t) => t.dueYmd > todayYmd && t.dueYmd <= horizon).length,
    overdue: tasks.filter((t) => t.dueYmd < todayYmd).length,
    notDue: tasks.filter((t) => t.dueYmd > horizon).length,
  };

  return NextResponse.json(
    {
      today: todayYmd,
      ownerName: me.name,
      days,
      stats,
      statusDisplay,
      tasks,
    },
    { headers: MOBILE_CORS },
  );
}
