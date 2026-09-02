import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  broadcasts,
  broadcastRecipients,
  broadcastPollResponses,
  type Broadcast,
  type BroadcastRecipient,
} from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { listMyBroadcasts, pendingLockBroadcastForEmployee } from "@/lib/ecos/queries";
import { senderLabel, readAttachments } from "@/lib/ecos/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

// Draft/scheduled broadcasts never belong in an employee's feed (mirrors the web
// EmployeeInbox client-side filter).
const HIDDEN_STATUS = new Set(["draft", "scheduled"]);

/** One inbox item = the broadcast flattened with THIS employee's receipt state. */
function itemDto(broadcast: Broadcast, receipt: BroadcastRecipient) {
  const acknowledged = receipt.status === "acknowledged";
  return {
    id: broadcast.id,
    title: broadcast.title,
    bodyHtml: broadcast.bodyHtml,
    bodyText: broadcast.bodyText,
    category: broadcast.category,
    priority: broadcast.priority,
    ackMode: broadcast.ackMode,
    requireLock: broadcast.requireLock,
    authorIdentity: broadcast.authorIdentity,
    sender: senderLabel(broadcast),
    attachments: readAttachments(broadcast.attachments),
    poll: broadcast.poll ?? null,
    publishedAt: broadcast.publishedAt?.toISOString() ?? null,
    createdAt: broadcast.createdAt.toISOString(),
    isRead: receipt.status !== "pending",
    acknowledged,
    // needsAck drives the app's "I Acknowledge" affordance.
    needsAck: broadcast.ackMode === "acknowledge" && !acknowledged,
    readAt: receipt.readAt?.toISOString() ?? null,
    acknowledgedAt: receipt.acknowledgedAt?.toISOString() ?? null,
  };
}

/** The pending app-lock broadcast — the full-screen takeover payload. */
function lockDto(b: Broadcast) {
  return {
    id: b.id,
    title: b.title,
    bodyHtml: b.bodyHtml,
    bodyText: b.bodyText,
    category: b.category,
    priority: b.priority,
    sender: senderLabel(b),
    attachments: readAttachments(b.attachments),
    poll: b.poll ?? null,
  };
}

/**
 * GET /api/mobile/communications — the employee's ECOS inbox: every broadcast
 * delivered to them (newest first) plus the pending app-lock broadcast, if any.
 * Mirrors the web `/communications` EmployeeInbox + the (app) layout lock gate,
 * reusing the exact web queries (`listMyBroadcasts`,
 * `pendingLockBroadcastForEmployee`) so the two surfaces can never diverge.
 * The lock query is fail-open by design — a read error never freezes the app.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const [rows, lock] = await Promise.all([
    listMyBroadcasts(me.id),
    pendingLockBroadcastForEmployee(me.id),
  ]);

  const items = rows
    .filter((r) => !HIDDEN_STATUS.has(r.broadcast.status))
    .map((r) => itemDto(r.broadcast, r.receipt));

  return NextResponse.json(
    { items, lock: lock ? lockDto(lock) : null, unread: items.filter((i) => !i.isRead).length },
    { headers: MOBILE_CORS },
  );
}

const ActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["read", "acknowledge", "poll"]),
  optionIndex: z.number().int().min(0).optional(),
});

/**
 * POST /api/mobile/communications — mark a broadcast read, acknowledge it (the
 * app-lock gate's only exit), or answer its poll/quiz. Self-scoped to the
 * caller's own receipt; mirrors `markBroadcastRead` / `acknowledgeBroadcast` /
 * `submitPollResponse` in the web actions exactly.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: MOBILE_CORS });
  }
  const { id, action, optionIndex } = parsed.data;

  // Every write requires a receipt addressed to this employee — you can only act
  // on a message that was actually sent to you.
  const receipt = await db.query.broadcastRecipients.findFirst({
    where: and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.employeeId, me.id)),
  });
  if (!receipt) {
    return NextResponse.json({ error: "This message wasn't sent to you." }, { status: 404, headers: MOBILE_CORS });
  }

  if (action === "read") {
    // pending → read only, so we never clobber an existing acknowledgement.
    if (receipt.status === "pending") {
      await db
        .update(broadcastRecipients)
        .set({ status: "read", readAt: new Date() })
        .where(
          and(
            eq(broadcastRecipients.broadcastId, id),
            eq(broadcastRecipients.employeeId, me.id),
            eq(broadcastRecipients.status, "pending"),
          ),
        );
    }
    return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
  }

  if (action === "acknowledge") {
    const now = new Date();
    await db
      .update(broadcastRecipients)
      .set({ status: "acknowledged", acknowledgedAt: now, readAt: receipt.readAt ?? now })
      .where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.employeeId, me.id)));
    return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
  }

  // action === "poll"
  const b = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, id) });
  const poll = b?.poll ?? null;
  if (!poll) {
    return NextResponse.json({ error: "This broadcast has no poll." }, { status: 400, headers: MOBILE_CORS });
  }
  if (optionIndex == null || optionIndex >= poll.options.length) {
    return NextResponse.json({ error: "Pick a valid option." }, { status: 400, headers: MOBILE_CORS });
  }
  await db
    .insert(broadcastPollResponses)
    .values({ broadcastId: id, employeeId: me.id, optionIndex })
    .onConflictDoNothing();
  const correct =
    poll.mode === "quiz" && typeof poll.correctIndex === "number" ? optionIndex === poll.correctIndex : null;
  return NextResponse.json({ ok: true, correct }, { headers: MOBILE_CORS });
}
