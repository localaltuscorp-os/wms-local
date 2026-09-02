import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { PENDING_STATUSES, TASK_PRIORITIES, type TaskStatus } from "@/db/enums";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { nextStatusesFor, type ActorRole } from "@/lib/auth/status-transitions";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { rateLimitOrError } from "@/lib/rate-limit";
import { createTasksCore } from "@/lib/tasks/create-task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/tasks — create a task from the app. Single doer; the
 * initiator defaults to the creator. Reuses createTasksCore so short-id, default
 * status, audit, notifications + calendar sync match the web create exactly.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) {
    return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });
  }

  const b = (await req.json().catch(() => null)) as {
    title?: string;
    doerId?: string;
    initiatorId?: string;
    priority?: string;
    dueAt?: string;
    subject?: string | null;
    description?: string | null;
  } | null;
  if (!b || typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "A client/title is required." }, { status: 400, headers: MOBILE_CORS });
  }
  if (typeof b.doerId !== "string") {
    return NextResponse.json({ error: "Pick a doer." }, { status: 400, headers: MOBILE_CORS });
  }
  if (typeof b.dueAt !== "string") {
    return NextResponse.json({ error: "A due date is required." }, { status: 400, headers: MOBILE_CORS });
  }
  if (!TASK_PRIORITIES.includes((b.priority ?? "") as (typeof TASK_PRIORITIES)[number])) {
    return NextResponse.json({ error: "Pick a priority." }, { status: 400, headers: MOBILE_CORS });
  }

  const result = await createTasksCore(
    { id: me.id, name: me.name },
    {
      title: b.title,
      doerId: b.doerId,
      initiatorId: b.initiatorId ?? me.id,
      priority: b.priority as (typeof TASK_PRIORITIES)[number],
      dueAt: b.dueAt,
      subject: b.subject ?? null,
      description: b.description ?? null,
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: MOBILE_CORS });
  }
  return NextResponse.json({ ok: true, id: result.id }, { headers: MOBILE_CORS });
}

const PENDING = new Set<TaskStatus>(PENDING_STATUSES);

/**
 * GET /api/mobile/tasks — the signed-in user's tasks (as doer, non-archived).
 * Pending tasks first (soonest due), then completed/closed (most recent first).
 * Each task carries `allowedTransitions` (the valid next statuses for THIS
 * user, straight from the permission matrix) so the app shows only legal moves,
 * and `updatedAt` for the optimistic-lock on the status-update call. The
 * `statusDisplay` map (label + colour token per status) lets the app render
 * pills without hard-coding labels.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const role: ActorRole = me.isAdmin ? "admin" : "doer";

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      description: tasks.description,
      subject: tasks.subject,
      client: tasks.client,
      status: tasks.status,
      priority: tasks.priority,
      // Effective due (revised ?? original) so the app sorts + flags by it.
      dueAt: effectiveDueAtSql(),
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.doerId, me.id), eq(tasks.archived, false)))
    .limit(1000);

  // Pending first (soonest due), then everything else (most recently touched).
  rows.sort((a, b) => {
    const ap = PENDING.has(a.status);
    const bp = PENDING.has(b.status);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    return new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime();
  });

  const statusDisplay = await getStatusDisplayMap();

  return NextResponse.json(
    {
      statusDisplay,
      tasks: rows.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        // The display name = description-or-title, exactly like the web task
        // list (task-table.tsx getDisplayTitle). `title` in the DB is often just
        // the client; the full task text lives in `description`.
        title: (t.description?.trim() || t.title),
        subject: t.subject,
        client: t.client,
        status: t.status,
        priority: t.priority,
        dueAt: new Date(t.dueAt).toISOString(),
        updatedAt: new Date(t.updatedAt).toISOString(),
        completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
        allowedTransitions: nextStatusesFor(t.status, role),
      })),
    },
    { headers: MOBILE_CORS },
  );
}
