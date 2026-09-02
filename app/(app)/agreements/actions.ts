"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { agreements } from "@/db/schema";
import { AGREEMENT_TYPES, AGREEMENT_TYPE_LABELS } from "@/db/enums";
import { requireAgreementsAdmin } from "@/lib/agreements/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { FIELD_VALUE_KEYS } from "@/lib/agreements/field-keys";

/**
 * Agreements module · admin server actions (create-or-update draft, send, delete).
 *
 * Every write is admin-only (requireAgreementsAdmin) + rate-limited + zod-validated.
 * The letter body is reconstructed anywhere from three durable columns —
 * `type`, `entity`, `employeeName` (joined) — plus the `fieldValues` jsonb bag,
 * whose keys mirror AgreementInput (minus type/entity/employeeName). See
 * FIELD_VALUE_KEYS below; the sign flow + PDF route rebuild the AgreementInput as:
 *   { type, employeeName, entity, ...fieldValues }
 */

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const UUID = z.string().uuid();

const saveSchema = z.object({
  id: UUID.optional(),
  employeeId: UUID,
  type: z.enum(AGREEMENT_TYPES),
  entity: z.string().trim().min(1, "Pick a paying entity.").max(120),
  title: z.string().trim().max(200).optional(),
  fieldValues: z.record(z.string(), z.string()).default({}),
});

export type SaveAgreementInput = z.input<typeof saveSchema>;

/** Create-or-update a DRAFT agreement. New rows get an auto sign token + creator. */
export async function saveAgreement(
  raw: SaveAgreementInput,
): Promise<ActionResult<{ id: string; signToken: string }>> {
  const me = await requireAgreementsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid agreement." };
  }
  const { id, employeeId, type, entity, title, fieldValues } = parsed.data;

  // Keep only recognised keys so a stray field can't bloat the row.
  const cleanFieldValues: Record<string, string> = {};
  for (const k of FIELD_VALUE_KEYS) {
    const v = fieldValues[k];
    if (typeof v === "string" && v.trim() !== "") cleanFieldValues[k] = v;
  }

  const resolvedTitle = title?.trim() || AGREEMENT_TYPE_LABELS[type];

  try {
    if (id) {
      // Only drafts stay editable; sent/signed letters are immutable.
      const updated = await db
        .update(agreements)
        .set({ type, entity, title: resolvedTitle, fieldValues: cleanFieldValues, updatedAt: new Date() })
        .where(and(eq(agreements.id, id), eq(agreements.status, "draft")))
        .returning({ id: agreements.id, signToken: agreements.signToken });
      if (updated.length === 0) {
        return { ok: false, error: "That draft can no longer be edited." };
      }
      revalidatePath("/agreements");
      return { ok: true, id: updated[0]!.id, signToken: updated[0]!.signToken };
    }

    const [row] = await db
      .insert(agreements)
      .values({
        employeeId,
        type,
        status: "draft",
        title: resolvedTitle,
        entity,
        fieldValues: cleanFieldValues,
        signToken: randomUUID().replace(/-/g, ""),
        createdById: me.id,
      })
      .returning({ id: agreements.id, signToken: agreements.signToken });
    revalidatePath("/agreements");
    return { ok: true, id: row!.id, signToken: row!.signToken };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Send a draft (or re-send) to the employee: status → 'sent', stamps sentAt. */
export async function sendAgreement(id: string): Promise<ActionResult<{ id: string }>> {
  const me = await requireAgreementsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid agreement." };

  try {
    const sent = await db
      .update(agreements)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agreements.id, id), inArray(agreements.status, ["draft", "sent"])))
      .returning({ id: agreements.id });
    if (sent.length === 0) {
      return { ok: false, error: "Only a draft or already-sent agreement can be sent." };
    }
    revalidatePath("/agreements");
    return { ok: true, id: sent[0]!.id };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Delete an agreement outright (admin housekeeping). */
export async function deleteAgreement(id: string): Promise<ActionResult> {
  const me = await requireAgreementsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid agreement." };

  try {
    const removed = await db
      .delete(agreements)
      .where(eq(agreements.id, id))
      .returning({ id: agreements.id });
    if (removed.length === 0) return { ok: false, error: "That agreement no longer exists." };
    revalidatePath("/agreements");
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
