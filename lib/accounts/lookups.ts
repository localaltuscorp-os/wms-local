"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsLookups } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

/** A single option for the module's managed dropdowns. */
export interface AccountsLookupOption {
  id: string;
  name: string;
}

export type LookupResult =
  | { ok: true; option: AccountsLookupOption }
  | { ok: false; error: string };
export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Active options for one dropdown `kind` (e.g. 'task_status', 'task_gear',
 * 'shot_gear', 'shot_freq'), ordered by the manual sort then alphabetically.
 * Soft-deleted (active=false) rows are excluded — they survive only so historic
 * rows that reference them never break.
 */
export async function listAccountsLookups(
  kind: string,
): Promise<AccountsLookupOption[]> {
  const rows = await db
    .select({ id: accountsLookups.id, name: accountsLookups.value })
    .from(accountsLookups)
    .where(and(eq(accountsLookups.kind, kind), eq(accountsLookups.active, true)))
    .orderBy(asc(accountsLookups.sortOrder), asc(accountsLookups.value));
  return rows;
}

/**
 * Add an option to a managed dropdown. Trims; rejects blank. De-duplicated
 * case-insensitively against the `(kind, lower(value))` unique index — if a
 * match exists it's reused, re-activating a soft-deleted match rather than
 * inserting a duplicate. Returns the resulting option either way.
 */
export async function addAccountsLookup(
  kind: string,
  value: string,
): Promise<LookupResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const cleanKind = kind.trim();
  const cleanValue = value.trim();
  if (!cleanKind) return { ok: false, error: "Missing dropdown kind." };
  if (!cleanValue) return { ok: false, error: "Enter a value." };
  if (cleanValue.length > 120) return { ok: false, error: "Value is too long (max 120)." };

  try {
    // Case-insensitive match against the unique index (active OR soft-deleted).
    const [existing] = await db
      .select({ id: accountsLookups.id, name: accountsLookups.value, active: accountsLookups.active })
      .from(accountsLookups)
      .where(
        and(
          eq(accountsLookups.kind, cleanKind),
          sql`lower(${accountsLookups.value}) = lower(${cleanValue})`,
        ),
      )
      .limit(1);

    if (existing) {
      if (!existing.active) {
        await db
          .update(accountsLookups)
          .set({ active: true })
          .where(eq(accountsLookups.id, existing.id));
      }
      revalidatePath("/accounts/task-list");
      return { ok: true, option: { id: existing.id, name: existing.name } };
    }

    const [inserted] = await db
      .insert(accountsLookups)
      .values({ kind: cleanKind, value: cleanValue })
      .returning({ id: accountsLookups.id, name: accountsLookups.value });
    revalidatePath("/accounts/task-list");
    return { ok: true, option: { id: inserted!.id, name: inserted!.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Soft-delete a dropdown option (active=false): it stops offering for new
 * entries but the row persists so existing references keep their label.
 */
export async function softDeleteAccountsLookup(id: string): Promise<DeleteResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!id) return { ok: false, error: "Missing id." };
  try {
    await db
      .update(accountsLookups)
      .set({ active: false })
      .where(eq(accountsLookups.id, id));
    revalidatePath("/accounts/task-list");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
