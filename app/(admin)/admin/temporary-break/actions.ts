"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { endTemporaryBreak, startTemporaryBreak } from "@/lib/employees/temporary-break";

const NODE = "admin.people.temporary-break";
const PATHS = ["/admin/temporary-break", "/admin/employee-master", "/admin/hierarchy", "/operations/team-reporting"];
const StartSchema = z.object({
  employeeId: z.string().uuid(),
  breakFrom: z.string().date(),
  expectedReturn: z.string().date().nullable(),
  reason: z.string().trim().max(2_000).nullable(),
}).strict();

export async function putEmployeeOnTemporaryBreak(input: z.infer<typeof StartSchema>) {
  const actor = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(actor.id, "write");
  if (limited) return { ok: false as const, error: limited.error };
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid Temporary Break details." };
  const result = await startTemporaryBreak({ ...parsed.data, actorId: actor.id });
  if (!result.ok) return result;
  for (const path of PATHS) revalidatePath(path);
  updateTag(CACHE_TAGS.employees);
  return result;
}

export async function endEmployeeTemporaryBreak(breakId: string) {
  const actor = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(actor.id, "write");
  if (limited) return { ok: false as const, error: limited.error };
  if (!z.string().uuid().safeParse(breakId).success) return { ok: false as const, error: "Invalid Temporary Break." };
  const result = await endTemporaryBreak({ breakId, actorId: actor.id });
  if (!result.ok) return result;
  for (const path of PATHS) revalidatePath(path);
  updateTag(CACHE_TAGS.employees);
  return result;
}
