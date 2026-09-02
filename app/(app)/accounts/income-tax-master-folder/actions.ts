"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsItFolders } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/accounts/income-tax-master-folder";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));

const Fields = z.object({
  entity: z.string().trim().min(1, "An entity is required.").max(400),
  fy: optText,
  folderLink: optText,
  notes: optText,
});
const UpdateSchema = Fields.extend({ id: z.string().uuid() });

export async function createItFolder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Fields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsItFolders.sortOrder}), 0) + 1` }).from(accountsItFolders)) as Array<{ next: number }>;
    const [row] = await db.insert(accountsItFolders).values({ entity: d.entity, fy: d.fy, folderLink: d.folderLink, notes: d.notes, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id }).returning({ id: accountsItFolders.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateItFolder(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsItFolders).set({ entity: d.entity, fy: d.fy, folderLink: d.folderLink, notes: d.notes, updatedAt: new Date() }).where(eq(accountsItFolders.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteItFolder(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsItFolders).set({ archived: true, updatedAt: new Date() }).where(eq(accountsItFolders.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
