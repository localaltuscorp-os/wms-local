"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  employeeId: z.string().uuid(),
  criteria: z.string().trim().max(2000).optional(),
  kra: z.string().trim().max(2000).optional(),
}).strict();

/**
 * Set an employee's KRA and/or performance criteria (admin only). Both fields
 * are read by Profile > Performance and the Weekly Goals board (and feed the
 * Star of the Month evaluation), so one edit updates every surface. Pass only
 * the field(s) you want to change.
 */
export async function setEmployeeCriteria(input: {
  employeeId: string;
  criteria?: string;
  kra?: string;
}): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const patch: { performanceCriteria?: string | null; kra?: string | null } = {};
  if (parsed.data.criteria !== undefined) patch.performanceCriteria = parsed.data.criteria || null;
  if (parsed.data.kra !== undefined) patch.kra = parsed.data.kra || null;
  if (Object.keys(patch).length === 0) return { ok: true };
  try {
    await db.update(employees).set(patch).where(eq(employees.id, parsed.data.employeeId));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/profile");
  revalidatePath("/weekly-goals");
  return { ok: true };
}
