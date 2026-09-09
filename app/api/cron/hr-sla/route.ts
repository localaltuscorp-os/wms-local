import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { hrTickets } from "@/db/schema";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { superAdminIds } from "@/lib/hr/access";
import { emit } from "@/lib/events/emit";
import { hrTicketSlaBreached, hrTicketClosed } from "@/lib/events/hr-ticket-events";
import { notify } from "@/lib/notifications/dispatch";
import { HR_TICKET_OPEN_STATUSES, HR_TICKET_STATUS_EMPLOYEE_LABELS } from "@/db/enums";

/**
 * HR Support SLA cron (design brief: "SLA = stamped dates + ONE breach cron —
 * NOT an engine"). Two jobs, both idempotent:
 *
 *   1. BREACH — open tickets whose first_response_due_at or resolution_due_at
 *      has passed (and not yet satisfied) and were never stamped as breached →
 *      stamp `sla_breached_at`, emit HrTicketSlaBreached, notify the assignee +
 *      super-admins EXACTLY ONCE (the stamp is the once-guard).
 *
 *   2. AUTO-CLOSE — resolved tickets untouched for > 72h → close them, emit
 *      HrTicketClosed, notify the requester (employee-facing copy).
 *
 * Auth: Bearer CRON_SECRET. Skips entirely when HR_SUPPORT_OFF. Node runtime.
 * Registered hourly (`0 * * * *`) — see vercel.json (added by the human).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTO_CLOSE_HOURS = 72;

function notifyBody(t: { id: string; ticketNo: number; category: string; confidential: boolean }, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ticketId: t.id, ticketNo: t.ticketNo, category: t.category, confidential: t.confidential, ...extra });
}
function ticketTitle(t: { ticketNo: number; subject: string; confidential: boolean }, verb: string): string {
  if (t.confidential) return `Confidential HR case #${t.ticketNo} — ${verb}`;
  const subj = t.subject.length > 48 ? `${t.subject.slice(0, 47)}…` : t.subject;
  return `#${t.ticketNo} ${subj} — ${verb}`;
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hrSupportEnabled()) {
    return NextResponse.json({ ok: true, skipped: "HR_SUPPORT_OFF" });
  }

  const now = new Date();
  const admins = await superAdminIds().catch(() => [] as string[]);

  // ── 1) Breach detection ────────────────────────────────────────────────
  const openTickets = await db
    .select()
    .from(hrTickets)
    .where(
      and(
        inArray(hrTickets.status, [...HR_TICKET_OPEN_STATUSES]),
        isNull(hrTickets.slaBreachedAt),
      ),
    )
    .limit(2000);

  let breached = 0;
  for (const t of openTickets) {
    const frtBreach = !t.firstRespondedAt && t.firstResponseDueAt && t.firstResponseDueAt.getTime() < now.getTime();
    const resBreach = !t.resolvedAt && t.resolutionDueAt && t.resolutionDueAt.getTime() < now.getTime();
    if (!frtBreach && !resBreach) continue;
    const breachKind = frtBreach ? "first_response" : "resolution";

    try {
      await db.transaction(async (tx) => {
        await tx.update(hrTickets).set({ slaBreachedAt: now, updatedAt: now }).where(eq(hrTickets.id, t.id));
        await emit(
          tx,
          hrTicketSlaBreached(
            t.id,
            {
              employeeId: t.employeeId,
              ticketNo: t.ticketNo,
              category: t.category,
              confidential: t.confidential,
              breachKind,
            },
            { actorId: t.assigneeId ?? t.employeeId },
          ),
        );
      });
    } catch (err) {
      console.error(`[cron/hr-sla] breach stamp failed for ${t.id}`, err);
      continue;
    }

    // Notify assignee + super-admins (generic copy for grievances).
    const recipients = new Set<string>(admins);
    if (t.assigneeId) recipients.add(t.assigneeId);
    const verb = breachKind === "first_response" ? "first-response SLA breached" : "resolution SLA breached";
    await Promise.allSettled(
      Array.from(recipients).map((userId) =>
        notify({
          userId,
          kind: "hr_ticket_sla_breach",
          title: ticketTitle(t, verb),
          body: notifyBody(t, { breachKind }),
          actorId: null,
        }),
      ),
    );
    breached += 1;
  }

  // ── 2) Auto-close resolved > 72h ───────────────────────────────────────
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_HOURS * 3_600_000);
  const staleResolved = await db
    .select()
    .from(hrTickets)
    .where(and(eq(hrTickets.status, "resolved"), lt(hrTickets.resolvedAt, cutoff)))
    .limit(2000);

  let autoClosed = 0;
  for (const t of staleResolved) {
    try {
      await db.transaction(async (tx) => {
        await tx.update(hrTickets).set({ status: "closed", closedAt: now, updatedAt: now }).where(eq(hrTickets.id, t.id));
        await emit(
          tx,
          hrTicketClosed(
            t.id,
            {
              employeeId: t.employeeId,
              ticketNo: t.ticketNo,
              category: t.category,
              confidential: t.confidential,
              fromStatus: "resolved",
              toStatus: "closed",
            },
            { actorId: t.employeeId },
          ),
        );
      });
    } catch (err) {
      console.error(`[cron/hr-sla] auto-close failed for ${t.id}`, err);
      continue;
    }
    await notify({
      userId: t.employeeId,
      kind: "hr_ticket_status_changed",
      title: ticketTitle(t, HR_TICKET_STATUS_EMPLOYEE_LABELS.closed),
      body: notifyBody(t, { toStatus: "closed", auto: true }),
      actorId: null,
    }).catch(() => {});
    autoClosed += 1;
  }

  return NextResponse.json({
    ok: true,
    at: now.toISOString(),
    scannedOpen: openTickets.length,
    breached,
    scannedResolved: staleResolved.length,
    autoClosed,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
