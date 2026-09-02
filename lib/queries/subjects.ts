import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { subjects, tasks, type Subject } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Active subject names, locale-sorted. Drives the "Subject" picker on the
 * New Task / Edit Task forms. Cached under `subjects`; writers
 * (`createSubject`, `updateSubject`, `quickAddSubject`) already invalidate
 * that tag.
 */
export const listActiveSubjectNames = unstable_cache(
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
