"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ddOptions, settingsEvents } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { slugifyListKey } from "@/lib/dd-options/constants";
import { nextSortOrder, listDdListKeys } from "@/lib/queries/dd-options";
import {
  CreateDdOptionSchema,
  CreateDdCategorySchema,
  RetireDdOptionSchema,
  type CreateDdOptionInput,
  type CreateDdCategoryInput,
  type RetireDdOptionInput,
} from "@/lib/validators/dd-option";

/**
 * DD MASTER — every WMS field that picks from a managed list reads
 * `dd_options` through lib/queries/dd-options.ts's `listActiveDdOptions`. None
 * do yet (see that file's header): this ships the registry and its
 * management screen first, so the first real dropdown that wants a managed
 * list has one call to make rather than a table and a screen to build.
 *
 * Reading the registry is open to every employee (the page); adding a
 * category or an option, and retiring one, is admin-only — re-checked here,
 * not just hidden in the UI.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function revalidateDdSurfaces() {
  revalidatePath("/operations/masters/dd");
  updateTag(CACHE_TAGS.ddOptions);
}

async function requireDdEditor() {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    throw new Error("Only an admin can change DD Master.");
  }
  return me;
}

/** Add one option to an EXISTING category. */
export async function createDdOption(input: CreateDdOptionInput): Promise<ActionResult<{ id: string }>> {
  let me;
  try {
    me = await requireDdEditor();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed" };
  }

  const parsed = CreateDdOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { listKey, label } = parsed.data;

  const clash = await db
    .select({ id: ddOptions.id })
    .from(ddOptions)
    .where(sql`${ddOptions.listKey} = ${listKey} and lower(${ddOptions.label}) = lower(${label})`)
    .limit(1);
  if (clash[0]) {
    return { ok: false, error: `"${label}" is already an option here.` };
  }

  const sortOrder = await nextSortOrder(listKey);
  const code = slugifyListKey(label) || `opt-${Date.now()}`;

  let inserted;
  try {
    [inserted] = await db
      .insert(ddOptions)
      .values({ listKey, code, label, sortOrder, createdBy: me.id })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("dd_options_key_code_uidx")) {
      return { ok: false, error: `"${label}" is already an option here.` };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await db.insert(settingsEvents).values({
      scope: "dd_option",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: { listKey, label },
    });
  } catch (err) {
    console.error("[createDdOption] audit write failed", err);
  }

  revalidateDdSurfaces();
  return { ok: true, id: inserted.id };
}

/** Start a brand-new category — the door that makes DD Master scale to
 *  whatever the next dropdown needs, with no code change. */
export async function createDdCategory(input: CreateDdCategoryInput): Promise<ActionResult<{ listKey: string }>> {
  let me;
  try {
    me = await requireDdEditor();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed" };
  }

  const parsed = CreateDdCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { categoryLabel, firstOptionLabel } = parsed.data;
  const listKey = slugifyListKey(categoryLabel);
  if (!listKey) {
    return { ok: false, error: "That category name doesn't produce a usable key — try letters or numbers." };
  }

  const existingKeys = await listDdListKeys();
  if (existingKeys.includes(listKey)) {
    return { ok: false, error: "A category with this name already exists." };
  }

  const code = slugifyListKey(firstOptionLabel) || `opt-${Date.now()}`;
  try {
    await db.insert(ddOptions).values({ listKey, code, label: firstOptionLabel, sortOrder: 1, createdBy: me.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "dd_option",
      targetId: listKey,
      actorId: me.id,
      eventType: "category_created",
      toValue: { listKey, categoryLabel, firstOptionLabel },
    });
  } catch (err) {
    console.error("[createDdCategory] audit write failed", err);
  }

  revalidateDdSurfaces();
  return { ok: true, listKey };
}

/**
 * Retire an option — NEVER a hard delete. `is_active` flips to false so it
 * stops being offered to new selections; `code` (what an existing record
 * would store) is untouched, so nothing already saved can corrupt.
 */
export async function retireDdOption(input: RetireDdOptionInput): Promise<ActionResult> {
  let me;
  try {
    me = await requireDdEditor();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed" };
  }

  const parsed = RetireDdOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.ddOptions.findFirst({ where: eq(ddOptions.id, parsed.data.id) });
  if (!existing) return { ok: false, error: "Option not found" };
  if (!existing.isActive) return { ok: true };

  try {
    await db.update(ddOptions).set({ isActive: false, updatedAt: new Date() }).where(eq(ddOptions.id, existing.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "dd_option",
      targetId: existing.id,
      actorId: me.id,
      eventType: "retired",
      fromValue: { isActive: true },
      toValue: { isActive: false },
    });
  } catch (err) {
    console.error("[retireDdOption] audit write failed", err);
  }

  revalidateDdSurfaces();
  return { ok: true };
}
