"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { indexSections, indexLinks } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  AddSectionSchema,
  RenameSectionSchema,
  DeleteSectionSchema,
  AddLinkSchema,
  EditLinkSchema,
  DeleteLinkSchema,
  normalizeUrl,
} from "@/lib/validators/index-hub";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

function revalidateIndex() {
  revalidatePath("/index");
  updateTag(CACHE_TAGS.indexHub);
}

/** max(sort_order)+10 so new rows append to the end, leaving gaps to reorder. */
async function nextSectionOrder(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${indexSections.sortOrder}), 0)::int` })
    .from(indexSections);
  return (row?.max ?? 0) + 10;
}

async function nextLinkOrder(sectionId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${indexLinks.sortOrder}), 0)::int` })
    .from(indexLinks)
    .where(eq(indexLinks.sectionId, sectionId));
  return (row?.max ?? 0) + 10;
}

export async function addIndexSection(
  input: { title: string },
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddSectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const sortOrder = await nextSectionOrder();
    const [row] = await db
      .insert(indexSections)
      .values({ title: parsed.data.title, sortOrder })
      .returning({ id: indexSections.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateIndex();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function renameIndexSection(
  input: { id: string; title: string },
): Promise<ActionResult> {
  const me = await requireAdmin();
  void me;
  const parsed = RenameSectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await db
      .update(indexSections)
      .set({ title: parsed.data.title, updatedAt: new Date() })
      .where(eq(indexSections.id, parsed.data.id));
    revalidateIndex();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function deleteIndexSection(input: { id: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  void me;
  const parsed = DeleteSectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  try {
    // index_links cascade-delete with the section.
    await db.delete(indexSections).where(eq(indexSections.id, parsed.data.id));
    revalidateIndex();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function addIndexLink(
  input: { sectionId: string; label: string; url: string },
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const sortOrder = await nextLinkOrder(parsed.data.sectionId);
    const [row] = await db
      .insert(indexLinks)
      .values({
        sectionId: parsed.data.sectionId,
        label: parsed.data.label,
        url: normalizeUrl(parsed.data.url),
        sortOrder,
      })
      .returning({ id: indexLinks.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateIndex();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function editIndexLink(
  input: { id: string; label: string; url: string },
): Promise<ActionResult> {
  const me = await requireAdmin();
  void me;
  const parsed = EditLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await db
      .update(indexLinks)
      .set({ label: parsed.data.label, url: normalizeUrl(parsed.data.url), updatedAt: new Date() })
      .where(eq(indexLinks.id, parsed.data.id));
    revalidateIndex();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function deleteIndexLink(input: { id: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  void me;
  const parsed = DeleteLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  try {
    await db.delete(indexLinks).where(eq(indexLinks.id, parsed.data.id));
    revalidateIndex();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Persist a new section order (admin). `orderedIds` is the full list of
 *  section ids top-to-bottom; sort_order is rewritten as 10,20,30… */
export async function reorderIndexSections(orderedIds: string[]): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    return { ok: false, error: "Invalid order" };
  }
  try {
    await Promise.all(
      orderedIds.map((id, i) =>
        db.update(indexSections).set({ sortOrder: (i + 1) * 10, updatedAt: new Date() }).where(eq(indexSections.id, id)),
      ),
    );
    revalidateIndex();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}
