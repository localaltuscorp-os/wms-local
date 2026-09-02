"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  saveLeaveCategory,
  setLeaveCategoryActive,
} from "@/lib/attendance/leave-categories";

/**
 * Leave-category admin, as server actions.
 *
 * THIN — the duplicate rule, the sort placement and the retire-don't-delete
 * decision all live in `lib/attendance/leave-categories`. This file adds the
 * session, the rate limit and the cache invalidation.
 *
 * `requireAdmin()` is the whole gate, and deliberately so: the ask was that
 * admins can extend the dropdown. Unlike client locations — which are narrowed
 * to three named people because they carry a geofence a punch is validated
 * against — a leave category is a label, and a wrong one is renamed rather than
 * being a hole in attendance.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/admin/leave-categories";
/** The employee-facing picker reads the same list. */
const LEAVE_PATH = "/attendance/leave";

const SaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Give the category a name.").max(120, "That name is too long."),
    sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export async function saveLeaveCategoryAction(
  input: z.input<typeof SaveSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category." };
  }

  const res = await saveLeaveCategory({ ...parsed.data, actorId: me.id });
  if (!res.ok) return res;

  revalidatePath(PATH);
  revalidatePath(LEAVE_PATH);
  return { ok: true, id: res.id };
}

const ActiveSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() }).strict();

/** Retire or revive. There is no delete — see the lib for why. */
export async function setLeaveCategoryActiveAction(
  input: z.input<typeof ActiveSchema>,
): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category." };
  }

  const res = await setLeaveCategoryActive(parsed.data.id, parsed.data.isActive);
  if (!res.ok) return res;

  revalidatePath(PATH);
  revalidatePath(LEAVE_PATH);
  return { ok: true };
}
