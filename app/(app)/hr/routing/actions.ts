"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hrTicketRoutes, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { HR_TICKET_CATEGORIES, type HrTicketCategory } from "@/db/enums";
import type { Employee } from "@/db/schema";

/**
 * category → owner routing editor (design brief: "category→owner auto-route").
 * Admin-only. A NULL owner falls back to super-admins at raise-time so no ticket
 * is ever born unowned. Uses upsert on the unique `category` column so it works
 * even before the 9 seed rows land.
 */

type Result = { ok: true } | { ok: false; error: string };

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

const Schema = z.object({
  category: z.enum(HR_TICKET_CATEGORIES as unknown as [HrTicketCategory, ...HrTicketCategory[]]),
  ownerId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

export async function updateRoute(input: { category: string; ownerId: string | null; isActive: boolean }): Promise<Result> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { category, ownerId, isActive } = parsed.data;

  if (ownerId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, ownerId), columns: { id: true } });
    if (!emp) return { ok: false, error: "Owner not found." };
  }

  try {
    await db
      .insert(hrTicketRoutes)
      .values({ category, ownerId, isActive, updatedById: me.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: hrTicketRoutes.category,
        set: { ownerId, isActive, updatedById: me.id, updatedAt: new Date() },
      });
  } catch (err) {
    return { ok: false, error: `Could not save route: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/hr/routing");
  return { ok: true };
}
