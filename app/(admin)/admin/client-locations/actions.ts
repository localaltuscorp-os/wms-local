"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  retireClientLocation,
  saveClientLocation,
} from "@/lib/attendance/client-locations";

/**
 * Client-location admin, as server actions.
 *
 * THIN — every rule (who may write, how a Maps link becomes coordinates, why a
 * site is retired rather than deleted) lives in `lib/attendance/client-locations`
 * so the permission cannot be satisfied by reaching the table another way. This
 * file adds the session, the rate limit and the cache invalidation.
 *
 * Note there is no `requireAdmin()` here. The gate is NARROWER than admin —
 * Manan, Rutvisha and Ruchita only — and it is applied inside the lib. Adding an
 * admin check as well would read as though admin were sufficient.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Give the client site a name.").max(200),
  address: z.string().max(500).nullable().optional(),
  mapsUrl: z.string().max(2000).nullable().optional(),
  radiusM: z.coerce.number().int().min(10).max(20000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function saveClientLocationAction(
  input: z.input<typeof SaveSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid client site." };
  }

  const res = await saveClientLocation({
    ...parsed.data,
    actor: { id: me.id, email: me.email },
  });
  if (!res.ok) return res;

  revalidatePath("/admin/client-locations");
  revalidatePath("/attendance/remote-work");
  return { ok: true, id: res.id };
}

export async function retireClientLocationAction(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid client site." };
  }

  const res = await retireClientLocation({ id, actor: { id: me.id, email: me.email } });
  if (!res.ok) return res;

  revalidatePath("/admin/client-locations");
  revalidatePath("/attendance/remote-work");
  return { ok: true };
}
