import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { subjects, tasks, type Subject } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { applySubjectPolicy } from "@/lib/tasks/subject-options";

/** The raw roster, straight from the table. Cached under `subjects`; writers
 *  (`createSubject`, `updateSubject`, `quickAddSubject`) already invalidate
 *  that tag. */
const listActiveSubjectRows = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.isActive, true))
      .orderBy(asc(subjects.name));
    return rows
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  },
  ["list-active-subject-names"],
  { tags: [CACHE_TAGS.subjects], revalidate: 600 },
);

/**
 * The subject names the pickers may OFFER — the New Task and Edit Task forms,
 * the bulk-entry grid, and the Tasks bulk-upload template.
 *
 * The retire/pin policy is applied OUTSIDE the cache on purpose. Inside it, a
 * change to the list in lib/tasks/subject-options.ts would not show up until
 * every cached entry aged out (up to 10 minutes) — and since editing that list
 * is the entire way this is controlled, it has to take effect the moment the
 * code ships.
 *
 * ⚠ OFFERED, not stored. Tasks already filed under a retired subject keep their
 * value untouched; this only governs what a NEW one may be filed under. See the
 * header of lib/tasks/subject-options.ts.
 */
export async function listActiveSubjectNames(): Promise<string[]> {
  return applySubjectPolicy(await listActiveSubjectRows());
}

export interface SubjectWithCount extends Subject {
  /** Tasks whose subject matches this row, case-insensitive. */
  taskCount: number;
}

/** Every subject (active + inactive) + a count of tasks filed under it. */
export async function listSubjectsWithCounts(): Promise<SubjectWithCount[]> {
  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      isActive: subjects.isActive,
      sortOrder: subjects.sortOrder,
      createdAt: subjects.createdAt,
      updatedAt: subjects.updatedAt,
      taskCount: sql<number>`count(${tasks.id})::int`,
    })
    .from(subjects)
    .leftJoin(tasks, sql`lower(${tasks.subject}) = lower(${subjects.name})`)
    .groupBy(subjects.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
