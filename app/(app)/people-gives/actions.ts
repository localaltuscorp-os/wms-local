"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pgIntroductions } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  CreateIntroductionSchema,
  AddLookupSchema,
  DeleteLookupSchema,
  type PgLookupKind,
} from "@/lib/validators/people-gives";
import type { PgLookupOption } from "@/lib/queries/people-gives";

const PATH = "/people-gives";

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Validated kind → physical table name. The kind is checked against the enum
// before this map is used, so the value is a fixed literal — never user text —
// which is why the `sql.raw` identifier below is injection-safe.
const LOOKUP_TABLE: Record<PgLookupKind, string> = {
  reference_source: "pg_reference_sources",
  designation: "pg_designations",
  business_category: "pg_business_categories",
  sales_person: "pg_sales_people",
};

/** Create a new introduction record. */
export async function createIntroduction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateIntroductionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  try {
    const [row] = await db
      .insert(pgIntroductions)
      .values({
        referenceSourceId: d.referenceSourceId,
        introducerFirstName: d.introducerFirstName,
        introducerLastName: d.introducerLastName,
        introducerCell: d.introducerCell,
        prospectCompany: d.prospectCompany,
        prospectFirstName: d.prospectFirstName,
        prospectLastName: d.prospectLastName,
        designationId: d.designationId,
        businessCategoryId: d.businessCategoryId,
        natureOfBusiness: d.natureOfBusiness,
        notes: d.notes,
        nextReminderDate: d.nextReminderDate,
        salesPersonId: d.salesPersonId,
        createdById: me.id,
      })
      .returning({ id: pgIntroductions.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Add an option to a managed dropdown. De-duplicated case-insensitively: if the
 * value already exists (active OR soft-deleted) it's reused — a soft-deleted
 * match is re-activated rather than duplicated.
 */
export async function addLookupOption(
  kind: PgLookupKind,
  name: string,
): Promise<Result<{ option: PgLookupOption }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddLookupSchema.safeParse({ kind, name });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
  }
  const table = LOOKUP_TABLE[parsed.data.kind];
  const value = parsed.data.name;
  const ident = sql.raw(`"${table}"`);

  try {
    const existing = (await db.execute(
      sql`SELECT id, name, is_active FROM ${ident} WHERE lower(name) = lower(${value}) LIMIT 1`,
    )) as unknown as Array<{ id: string; name: string; is_active: boolean }>;

    if (existing[0]) {
      if (!existing[0].is_active) {
        await db.execute(
          sql`UPDATE ${ident} SET is_active = true, updated_at = now() WHERE id = ${existing[0].id}`,
        );
      }
      revalidatePath(PATH);
      return { ok: true, option: { id: existing[0].id, name: existing[0].name } };
    }

    const inserted = (await db.execute(
      sql`INSERT INTO ${ident} (name) VALUES (${value}) RETURNING id, name`,
    )) as unknown as Array<{ id: string; name: string }>;
    revalidatePath(PATH);
    return { ok: true, option: { id: inserted[0]!.id, name: inserted[0]!.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Soft-delete a dropdown option: it stops appearing for new entries but the row
 * stays in place so existing introductions that reference it never break.
 */
export async function softDeleteLookupOption(
  kind: PgLookupKind,
  id: string,
): Promise<Result> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DeleteLookupSchema.safeParse({ kind, id });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const ident = sql.raw(`"${LOOKUP_TABLE[parsed.data.kind]}"`);
  try {
    await db.execute(
      sql`UPDATE ${ident} SET is_active = false, updated_at = now() WHERE id = ${parsed.data.id}`,
    );
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
