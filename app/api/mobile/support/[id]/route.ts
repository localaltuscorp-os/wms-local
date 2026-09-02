import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { resolveViewer, getTicketBundle } from "@/lib/queries/hr-support";
import {
  requireHrWorkspace,
  loadForViewer,
  replyOnTicketMobile,
  addInternalNoteMobile,
  assignTicketMobile,
  changeStatusMobile,
  changePriorityMobile,
  AttachmentSchema,
} from "../_desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/support/:id — full ticket detail (the web thread page). Returns
 * the ticket + its message thread + attachments (each with a short-lived signed
 * URL) + the viewer's role flags (isRequester / canHandle / canSeeInternal),
 * gated by the SAME visibility choke point (visibleTicketsFilter): internal notes
 * and their attachments are stripped for viewers who may not see them. 404 when
 * the ticket isn't visible to the caller.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const gate = await requireHrWorkspace(me);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: MOBILE_CORS });

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: MOBILE_CORS });
  }

  const v = await resolveViewer(me);
  const bundle = await getTicketBundle(v, id);
  if (!bundle) return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });

  return NextResponse.json(
    {
      ticket: bundle.ticket,
      messages: bundle.messages,
      attachments: bundle.attachments,
      isRequester: bundle.isRequester,
      canHandle: bundle.canHandle,
      canSeeInternal: bundle.canSeeInternal,
    },
    { headers: MOBILE_CORS },
  );
}

const ActionSchema = z.object({
  action: z.enum(["reply", "note", "assign", "status", "priority", "reopen"]),
  body: z.string().optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

/**
 * POST /api/mobile/support/:id — an action on a ticket, the mobile twin of the
 * web thread controls. JSON { action, body?, attachments?, assigneeId?, status?,
 * priority? }. Routes to the matching web action's logic with identical
 * authorization: reply/note (attachments pre-uploaded), assign/status/priority
 * (HR handler only, save the employee's own confirm-close / reopen), reopen
 * (= status→reopened, ≤7-day window). Same event emits + notify fan-out.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const gate = await requireHrWorkspace(me);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: MOBILE_CORS });

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  const loaded = await loadForViewer(me, id);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: MOBILE_CORS });

  let result: Awaited<ReturnType<typeof replyOnTicketMobile>>;
  switch (d.action) {
    case "reply":
      result = await replyOnTicketMobile(me, loaded, d.body, d.attachments);
      break;
    case "note":
      result = await addInternalNoteMobile(me, loaded, d.body, d.attachments);
      break;
    case "assign":
      if (d.assigneeId === undefined) {
        return NextResponse.json({ error: "assigneeId required" }, { status: 400, headers: MOBILE_CORS });
      }
      result = await assignTicketMobile(me, loaded, d.assigneeId);
      break;
    case "status":
      if (!d.status) return NextResponse.json({ error: "status required" }, { status: 400, headers: MOBILE_CORS });
      result = await changeStatusMobile(me, loaded, d.status);
      break;
    case "priority":
      if (!d.priority) return NextResponse.json({ error: "priority required" }, { status: 400, headers: MOBILE_CORS });
      result = await changePriorityMobile(me, loaded, d.priority);
      break;
    case "reopen":
      result = await changeStatusMobile(me, loaded, "reopened");
      break;
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: MOBILE_CORS });
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
