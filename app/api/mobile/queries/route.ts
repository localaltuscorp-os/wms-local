import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { resolveViewer, listMyTickets, listHrNotifications } from "@/lib/queries/hr-support";
import {
  HR_TICKET_CATEGORIES,
  HR_TICKET_CATEGORY_LABELS,
  HR_TICKET_PRIORITIES,
  HR_TICKET_PRIORITY_LABELS,
  type HrTicketCategory,
  type HrTicketPriority,
} from "@/db/enums";
import { requireHrWorkspace, raiseTicketMobile, AttachmentSchema } from "../support/_desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/queries — the "Ask HR" surface (web /queries page). Returns the
 * signed-in user's own query-door tickets (listMyTickets scoped to source
 * "query") plus their HR-ticket notifications inbox (listHrNotifications, which
 * deep-links each to /support/:id). Carries the raise-form schema (categories +
 * priorities) so the app can render the Ask-HR composer. Reuses the exact web
 * read layer so the phone and web can never diverge.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const gate = await requireHrWorkspace(me);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: MOBILE_CORS });

  const v = await resolveViewer(me);
  const [queries, notifications] = await Promise.all([listMyTickets(v, "query"), listHrNotifications(me)]);

  return NextResponse.json(
    {
      tickets: queries,
      notifications,
      forms: {
        categories: HR_TICKET_CATEGORIES.map((c) => ({ value: c, label: HR_TICKET_CATEGORY_LABELS[c] ?? c })),
        priorities: HR_TICKET_PRIORITIES.map((p) => ({ value: p, label: HR_TICKET_PRIORITY_LABELS[p] ?? p })),
      },
    },
    { headers: MOBILE_CORS },
  );
}

// The Ask-HR composer defaults to low priority; the raise core also applies this
// default when `source==="query"` and no priority is given.
const QuerySchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject").max(200, "Subject too long"),
  description: z.string().trim().min(1, "Describe your request").max(8000, "Too long"),
  category: z.enum(HR_TICKET_CATEGORIES as unknown as [HrTicketCategory, ...HrTicketCategory[]]),
  priority: z.enum(HR_TICKET_PRIORITIES as unknown as [HrTicketPriority, ...HrTicketPriority[]]).optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

/**
 * POST /api/mobile/queries — raise an "Ask HR" query. Same raise core as the
 * Support door (routing + SLA + first message + notify), but pinned to
 * source="query" so it lands on the Queries surface and defaults to LOW priority.
 * Attachments are pre-uploaded via /api/mobile/storage/sign (paths validated to
 * the caller's own folder). JSON { subject, description, category, priority?,
 * attachments? }.
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
  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }

  const result = await raiseTicketMobile(me, { ...parsed.data, source: "query" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: MOBILE_CORS });
  return NextResponse.json({ ok: true, id: result.id }, { headers: MOBILE_CORS });
}
