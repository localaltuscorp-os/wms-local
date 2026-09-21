"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hrContacts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditHrRegisters } from "@/lib/hr/registers";

type R<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Address Book writes. Ruchita, Rutvisha and Manan only (lib/hr/registers.ts) —
 * checked HERE on every write, because a hidden button is a courtesy and this
 * action is the rule.
 */
async function editor(): Promise<R<{ id: string }>> {
  const me = await requireUser();
  if (!canEditHrRegisters(me.email)) {
    return { ok: false, error: "Only Ruchita, Rutvisha and Manan can change the Address Book." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  return { ok: true, id: me.id };
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const ContactSchema = z.object({
  id: z.string().uuid().optional(),
  companyName: opt(160),
  personName: z.string().trim().min(1, "Enter the person's name.").max(120),
  cellNo: opt(24),
  alternateNo: opt(24),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address.")
    .transform((v) => (v ? v.toLowerCase() : null)),
  service: z.string().trim().min(1, "Choose or type a service.").max(80),
  notes: opt(1000),
});

export async function saveContact(input: z.input<typeof ContactSchema>): Promise<R<{ id: string }>> {
  const who = await editor();
  if (!who.ok) return who;

  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const { id, ...v } = parsed.data;

  try {
    if (id) {
      const [row] = await db
        .update(hrContacts)
        .set({ ...v, updatedById: who.id, updatedAt: new Date() })
        .where(eq(hrContacts.id, id))
        .returning({ id: hrContacts.id });
      if (!row) return { ok: false, error: "That contact no longer exists." };
      revalidatePath("/hr/address-book");
      return { ok: true, id: row.id };
    }
    const [row] = await db
      .insert(hrContacts)
      .values({ ...v, createdById: who.id, updatedById: who.id })
      .returning({ id: hrContacts.id });
    revalidatePath("/hr/address-book");
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the contact." };
  }
}

/** Mark a contact active / inactive. Inactive contacts are kept and listed separately. */
export async function setContactActive(id: string, active: boolean): Promise<R> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid contact." };
  await db
    .update(hrContacts)
    .set({ isActive: active, updatedById: who.id, updatedAt: new Date() })
    .where(eq(hrContacts.id, id));
  revalidatePath("/hr/address-book");
  return { ok: true };
}

export async function deleteContact(id: string): Promise<R> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid contact." };
  await db.delete(hrContacts).where(eq(hrContacts.id, id));
  revalidatePath("/hr/address-book");
  return { ok: true };
}
