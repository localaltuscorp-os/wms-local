import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  resolveViewer,
  listMyTickets,
  listQueue,
  queueCounts,
  listAssignableHandlers,
  type QueueFilters,
} from "@/lib/queries/hr-support";
import {
  HR_TICKET_CATEGORIES,
  HR_TICKET_CATEGORY_LABELS,
  HR_TICKET_PRIORITIES,
  HR_TICKET_PRIORITY_LABELS,
  type HrTicketCategory,
  type HrTicketPriority,
} from "@/db/enums";
import { requireHrWorkspace, raiseTicketMobile, RaiseSchema } from "./_desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/support — the HR Support desk, the mobile twin of the web
 * /support page. `?view=mine` (default) returns the signed-in user's own Support
 * tickets (listMyTickets scoped to source "support"); `?view=queue` returns the
 * HR handler queue (listQueue + queueCounts), gated to handlers/super-admins,
 * with the same status/priority/category/assignee/source filter pills the web
 * bar drives. Always carries the viewer capability flags + the raise-form schema
 * (categories + priorities) so the app can render the "Raise a ticket" screen.
 * Reuses the exact web read layer so the phone and web can never diverge.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const gate = await requireHrWorkspace(me);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: MOBILE_CORS });

  const url = new URL(req.url);
  const view = url.searchParams.get("view") === "queue" ? "queue" : "mine";
  const v = await resolveViewer(me);

  const caps = { handler: v.handler, superAdmin: v.superAdmin, isAdmin: me.isAdmin };
  const forms = {
    categories: HR_TICKET_CATEGORIES.map((c) => ({ value: c, label: HR_TICKET_CATEGORY_LABELS[c] ?? c })),
    priorities: HR_TICKET_PRIORITIES.map((p) => ({ value: p, label: HR_TICKET_PRIORITY_LABELS[p] ?? p })),
  };

  if (view === "queue") {
    // The queue is a handler surface — mirror the web page (only handlers see it).
    if (!v.handler && !v.superAdmin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
    }
    const q = (name: string): string | undefined => url.searchParams.get(name) ?? undefined;
    const filters: QueueFilters = {
      status: (q("status") as QueueFilters["status"]) ?? "open",
      priority: q("priority") as HrTicketPriority | undefined,
      category: q("category") as HrTicketCategory | undefined,
      assignee: (q("assignee") as QueueFilters["assignee"]) ?? "all",
      source: (q("source") as QueueFilters["source"]) ?? "all",
    };
    const [queue, counts, handlers] = await Promise.all([
      listQueue(v, filters),
      queueCounts(v),
      listAssignableHandlers(),
    ]);
    return NextResponse.json({ view, caps, filters, counts, tickets: queue, handlers, forms }, { headers: MOBILE_CORS });
  }

  const tickets = await listMyTickets(v, "support");
  return NextResponse.json({ view, caps, tickets, forms }, { headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/support — raise a Support ticket. JSON body:
 *   { subject, description, category, priority?, source? ("support"|"query"),
 *     attachments?: [{ filePath: "<me.id>/…", fileName, mimeType?, sizeBytes? }] }
 * Attachments are PRE-uploaded via /api/mobile/storage/sign; we only reference
 * their paths (validated to live under the caller's own folder). Mirrors the web
 * `raiseTicket` action: category→owner routing, SLA stamping, first message +
 * event emit, and the routed-assignee (+ grievance super-admin) notify.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const gate = await requireHrWorkspace(me);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = RaiseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }

  const result = await raiseTicketMobile(me, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: MOBILE_CORS });
  return NextResponse.json({ ok: true, id: result.id }, { headers: MOBILE_CORS });
}
