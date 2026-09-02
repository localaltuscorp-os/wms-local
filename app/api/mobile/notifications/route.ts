import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listInboxNotifications, getUnreadCount } from "@/lib/queries/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/notifications[?before=&limit=] — the signed-in user's inbox
 * feed (backs the push notifications the app registers for) + unread count for
 * the tab badge. Cursor-paginated by createdAt via `before`.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const url = new URL(req.url);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30) || 30, 100);

  const validBefore = before && !Number.isNaN(before.getTime()) ? before : undefined;
  const [page, unreadCount] = await Promise.all([
    listInboxNotifications({ userId: me.id, isAdmin: me.isAdmin, limit, ...(validBefore ? { before: validBefore } : {}) }),
    getUnreadCount(me.id),
  ]);

  const notifications = page.notifications.map((n) => ({
    id: n.id,
    taskId: n.taskId ?? null,
    kind: n.kind ?? "",
    title: n.title ?? "",
    body: n.body ?? null,
    actorName: n.actorName ?? null,
    taskTitle: n.taskTitle ?? null,
    taskSubject: n.taskSubject ?? null,
    taskStatus: n.taskStatus ?? null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt ? n.createdAt.toISOString() : "",
    link: n.taskId ? `altus://task/${n.taskId}` : null,
  }));

  return NextResponse.json(
    { notifications, nextCursor: page.nextCursor, hasMore: page.hasMore, unreadCount },
    { headers: MOBILE_CORS },
  );
}
