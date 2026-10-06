"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsKycDocuments } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/accounts/vasa-family-kyc";
type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const optionalText = z.preprocess((value) => typeof value === "string" ? value.trim() : value, z.string().max(4000).nullable().optional()).transform((value) => value || null);
const Fields = z.object({
  person: z.string().trim().min(1, "A person is required.").max(500),
  documentType: z.string().trim().min(1, "A document type is required.").max(500),
  documentNumber: optionalText,
  issuedOn: optionalText,
  expiresOn: optionalText,
  fileLink: optionalText,
  notes: optionalText,
});
const Update = Fields.extend({ id: z.string().uuid() });

export async function createKycDocument(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Fields.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid document." };
  try {
    const next = await db.select({ value: sql<number>`COALESCE(MAX(${accountsKycDocuments.sortOrder}), 0) + 1` }).from(accountsKycDocuments);
    const [row] = await db.insert(accountsKycDocuments).values({ ...parsed.data, sortOrder: next[0]?.value ?? 1, createdById: me.id }).returning({ id: accountsKycDocuments.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

export async function updateKycDocument(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Update.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid document." };
  const { id, ...values } = parsed.data;
  try {
    await db.update(accountsKycDocuments).set({ ...values, updatedAt: new Date() }).where(eq(accountsKycDocuments.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

export async function deleteKycDocument(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid document." };
  try {
    await db.update(accountsKycDocuments).set({ archived: true, updatedAt: new Date() }).where(eq(accountsKycDocuments.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
