"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjects, tasks, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  CreateSubjectSchema,
  UpdateSubjectSchema,
  SubjectIdSchema,
  type CreateSubjectInput,
  type UpdateSubjectInput,
} from "@/lib/validators/subject";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function revalidateSubjectSurfaces() {
  revalidatePath("/admin/subjects");
  revalidatePath("/tasks/new");
  revalidatePath("/tasks");
  revalidatePath("/");
  updateTag(CACHE_TAGS.subjects);
  // A subject rename rewrites `tasks.subject` in place (see
  // updateSubject), so the cached distinct-subject list and the
  // tasks-totals cache need to drop too.
  updateTag(CACHE_TAGS.tasks);
}

export async function createSubject(
  input: CreateSubjectInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateSubjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(sql`lower(${subjects.name}) = lower(${parsed.data.name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "A subject with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(subjects)
      .values({ name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 100 })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await db.insert(settingsEvents).values({
      scope: "subject",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: { name: inserted.name, sortOrder: inserted.sortOrder },
    });
  } catch (err) {
    console.error("[createSubject] audit write failed", err);
  }

  revalidateSubjectSurfaces();
  return { ok: true, id: inserted.id };
}

export async function updateSubject(
  subjectId: string,
  fields: UpdateSubjectInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = SubjectIdSchema.safeParse(subjectId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid subject id" };
  }

  const parsed = UpdateSubjectSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, parsedId.data),
  });
  if (!subject) return { ok: false, error: "Subject not found" };

  if (parsed.data.name !== undefined && parsed.data.name !== subject.name) {
    const clash = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(sql`lower(${subjects.name}) = lower(${parsed.data.name})`)
      .limit(1);
    if (clash[0] && clash[0].id !== subject.id) {
      return { ok: false, error: "A subject with this name already exists." };
    }
  }

  const patch: Partial<typeof subjects.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(subjects).set(patch).where(eq(subjects.id, subject.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("subjects_name_unique")) {
      return { ok: false, error: "A subject with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  // Propagate a rename to every task filed under the old subject.
  if (parsed.data.name !== undefined && parsed.data.name !== subject.name) {
    try {
      await db
        .update(tasks)
        .set({ subject: parsed.data.name })
        .where(sql`lower(${tasks.subject}) = lower(${subject.name})`);
    } catch (err) {
      console.error("[updateSubject] failed to propagate rename to tasks.subject", err);
    }
  }

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== subject.name) {
      fromValue.name = subject.name;
      toValue.name = parsed.data.name;
    }
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== subject.isActive) {
      fromValue.isActive = subject.isActive;
      toValue.isActive = parsed.data.isActive;
    }
    if (parsed.data.sortOrder !== undefined && parsed.data.sortOrder !== subject.sortOrder) {
      fromValue.sortOrder = subject.sortOrder;
      toValue.sortOrder = parsed.data.sortOrder;
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(settingsEvents).values({
        scope: "subject",
        targetId: subject.id,
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateSubject] audit write failed", err);
  }

  revalidateSubjectSurfaces();
  return { ok: true };
}
