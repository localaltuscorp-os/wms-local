import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { INCENTIVE_TYPES, type IncentiveType } from "@/db/enums";
import { validateIncentiveDetails } from "@/lib/incentive-fields";
import { checkSplit, type IncentiveSplitShare } from "@/lib/incentive/split";
import { listActiveProductNames } from "@/lib/queries/products";

/**
 * NEW INCENTIVE REQUEST — the server-side gate both entry points share.
 *
 * `createIncentiveRequest` (web) and POST /api/mobile/incentive each used to
 * parse and validate on their own, identically by copy. They now call this, so
 * the mobile-number, email, product, client-permission, date and split rules
 * are enforced once, the same way, whichever client files the request — the
 * dialog's inline validation is a convenience on top, never the only check.
 *
 * Reads only (the product master and the split's employees). The caller
 * inserts what it returns.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RequestSchema = z
  .object({
    type: z.enum(INCENTIVE_TYPES),
    details: z.record(z.string(), z.string()),
    // Loose here on purpose: the friendly messages (too many people, missing
    // employee, bad share) come from checkSplit. This only bounds the payload.
    split: z
      .array(z.object({ employeeId: z.string().max(64), pct: z.number() }).strict())
      .max(20)
      .nullable()
      .optional(),
  })
  .strict();

export interface PreparedIncentiveRequest {
  employeeId: string;
  type: IncentiveType;
  details: Record<string, string>;
  split: IncentiveSplitShare[] | null;
}

export async function prepareIncentiveRequest(
  requesterId: string,
  input: unknown,
): Promise<{ ok: true; values: PreparedIncentiveRequest } | { ok: false; error: string }> {
  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { type, details, split } = parsed.data;

  // Product options are whatever Admin → Products has active right now. The
  // reader is cached under the `products` tag, which every product write busts.
  const productNames = await listActiveProductNames();
  const validated = validateIncentiveDetails(type, details, { productNames });
  if (!validated.ok) return validated;

  let shares: IncentiveSplitShare[] | null = null;
  if (split && split.length > 0) {
    const check = checkSplit(split, { requesterId });
    if (!check.ok) return { ok: false, error: check.error };

    const ids = check.shares.map((s) => s.employeeId);
    if (!ids.every((id) => UUID_RE.test(id))) {
      return { ok: false, error: "Pick an employee for every person in the split." };
    }
    // Names are read from the employee rows, never taken from the client, and
    // only active employees can share an incentive.
    const found = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(inArray(employees.id, ids), eq(employees.isActive, true)));
    const nameById = new Map(found.map((r) => [r.id, r.name]));
    if (ids.some((id) => !nameById.has(id))) {
      return { ok: false, error: "Everyone in the split must be an active employee." };
    }
    shares = check.shares.map((s) => ({ employeeId: s.employeeId, name: nameById.get(s.employeeId)!, pct: s.pct }));
  }

  return {
    ok: true,
    values: { employeeId: requesterId, type, details: validated.details, split: shares },
  };
}
