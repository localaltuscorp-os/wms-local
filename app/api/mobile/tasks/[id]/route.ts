import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { getTaskById } from "@/lib/queries/tasks";
import { listTaskEvents } from "@/lib/queries/audit";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { nextStatusesFor, type ActorRole } from "@/lib/auth/status-transitions";
import { canComment } from "@/lib/auth/task-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * GET /api/mobile/tasks/:id — full task detail + activity timeline for the
 * native detail screen. Read access is participants-or-admin (strangers 403,
 * matching the web RLS rule). Returns the user's `allowedTransitions` and
 * `canComment` so the screen shows only the controls they may use.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { id } = await ctx.params;

  const task = await getTaskById(id);
  if (!task) {
    return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });
  }

  const role: ActorRole = me.isAdmin
    ? "admin"
    : task.doerId === me.id
      ? "doer"
      : task.initiatorId === me.id
        ? "initiator"
        : task.createdById === me.id
          ? "creator"
          : "stranger";
  if (role === "stranger") {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const [events, statusDisplay] = await Promise.all([listTaskEvents(id), getStatusDisplayMap()]);

  return NextResponse.json(
    {
      task: {
        id: task.id,
        taskNo: task.taskNo,
        title: task.title,
        subject: task.subject,
        client: task.client,
        description: task.description,
        notes: task.notes,
        status: task.status,
        priority: task.priority,
        approvalStatus: task.approvalStatus,
        dueAt: iso(task.dueAt),
        revisedTargetDate: iso(task.revisedTargetDate),
        createdAt: iso(task.createdAt),
        completedAt: iso(task.completedAt),
        updatedAt: iso(task.updatedAt),
        doerName: task.doerName,
        initiatorName: task.initiatorName,
        creatorName: task.creatorName,
      },
      statusDisplay,
      allowedTransitions: nextStatusesFor(task.status, role),
      canComment: canComment({
        employee: { id: me.id, isAdmin: me.isAdmin },
        task: {
          createdById: task.createdById,
          initiatorId: task.initiatorId,
          doerId: task.doerId,
          status: task.status,
        },
      }),
      timeline: events.map((e) => ({
        id: e.id,
        actorName: e.actorName,
        eventType: e.eventType,
        note: e.note,
        fromValue: e.fromValue,
        toValue: e.toValue,
        createdAt: e.createdAt.toISOString(),
      })),
    },
    { headers: MOBILE_CORS },
  );
}
