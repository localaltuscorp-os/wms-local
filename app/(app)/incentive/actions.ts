"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees, incentiveRequests } from "@/db/schema";
import { INCENTIVE_TYPES, INCENTIVE_TYPE_LABELS } from "@/db/enums";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { incentiveDetailPairs, validateIncentiveDetails } from "@/lib/incentive-fields";
import { sendIncentiveDecisionEmail } from "@/lib/email/resend";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const CreateSchema = z
  .object({
    type: z.enum(INCENTIVE_TYPES),
    details: z.record(z.string(), z.string()),
  })
  .strict();

/** File a new incentive request (any signed-in employee, for themselves). */
export async function createIncentiveRequest(input: {
  type: (typeof INCENTIVE_TYPES)[number];
  details: Record<string, string>;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const validated = validateIncentiveDetails(parsed.data.type, parsed.data.details);
  if (!validated.ok) return validated;

  let inserted;
  try {
    [inserted] = await db
      .insert(incentiveRequests)
      .values({
        employeeId: me.id,
        type: parsed.data.type,
        details: validated.details,
      })
      .returning({ id: incentiveRequests.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/incentive");
  return { ok: true, id: inserted.id };
}

const DecideSchema = z
  .object({
    id: z.string().uuid(),
    verdict: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Admin verdict on a pending request. Re-deciding an already-decided
 *  request is allowed (corrections) — the latest verdict wins. */
export async function decideIncentiveRequest(input: {
  id: string;
  verdict: "approved" | "rejected";
  note?: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.incentiveRequests.findFirst({
    where: eq(incentiveRequests.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Request not found" };

  try {
    await db
      .update(incentiveRequests)
      .set({
        status: parsed.data.verdict,
        decidedById: me.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.note ? parsed.data.note : null,
        updatedAt: new Date(),
      })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  // Best-effort: email the employee the decision. A send failure (or a missing
  // employee row) must never break the verdict — log and move on.
  try {
    const recipient = await db.query.employees.findFirst({
      columns: { email: true, name: true, isActive: true },
      where: eq(employees.id, existing.employeeId),
    });
    if (recipient?.email) {
      // Surface the first couple of request details (skipping free-text notes)
      // so the email has context without dumping the whole form.
      const detailPairs = incentiveDetailPairs(existing.type, existing.details)
        .filter(([label]) => label.toLowerCase() !== "notes")
        .slice(0, 4);
      const result = await sendIncentiveDecisionEmail({
        recipient: { email: recipient.email, name: recipient.name },
        typeLabel: INCENTIVE_TYPE_LABELS[existing.type],
        verdict: parsed.data.verdict,
        detailPairs,
        note: parsed.data.note ?? null,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      });
      if (result.error) {
        console.error(
          `[incentive/decide] decision email failed for ${recipient.email}:`,
          result.error,
        );
      }
    }
  } catch (err) {
    console.error("[incentive/decide] decision email threw", err);
  }

  revalidatePath("/incentive");
  return { ok: true };
}
