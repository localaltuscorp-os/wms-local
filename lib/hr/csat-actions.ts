"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hrTickets } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { requireHrSupport } from "@/lib/hr/flag";
import { rateLimitOrError } from "@/lib/rate-limit";
import { emit } from "@/lib/events/emit";
import { hrTicketCsatSubmitted } from "@/lib/events/hr-ticket-events";

/**
 * CSAT on resolve. The REQUESTER rates their resolved/closed ticket 1–5 with an
 * optional comment. One choke point; no handler can submit on the employee's
 * behalf. Confidential tickets are ratable too (the score never surfaces in the
 * metrics drill-down — see lib/hr/metrics.ts).
 */

type Result = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  ticketId: z.string().uuid(),
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function submitCsat(input: { ticketId: string; score: number; comment?: string }): Promise<Result> {
  requireHrSupport();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { ticketId, score, comment } = parsed.data;

  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Only the requester of a resolved/closed ticket may rate it.
  const [ticket] = await db
    .select({
      id: hrTickets.id,
      ticketNo: hrTickets.ticketNo,
      employeeId: hrTickets.employeeId,
      assigneeId: hrTickets.assigneeId,
      category: hrTickets.category,
      confidential: hrTickets.confidential,
      status: hrTickets.status,
    })
    .from(hrTickets)
    .where(and(eq(hrTickets.id, ticketId), eq(hrTickets.employeeId, me.id)))
    .limit(1);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (ticket.status !== "resolved" && ticket.status !== "closed") {
    return { ok: false, error: "You can rate a ticket once it's resolved." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(hrTickets)
        .set({ csatScore: score, csatComment: comment ?? null, updatedAt: new Date() })
        .where(eq(hrTickets.id, ticketId));
      await emit(
        tx,
        hrTicketCsatSubmitted(
          ticketId,
          {
            employeeId: ticket.employeeId,
            ticketNo: ticket.ticketNo,
            category: ticket.category,
            confidential: ticket.confidential,
            csatScore: score,
          },
          { actorId: me.id },
        ),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not save your rating: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}
