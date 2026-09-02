"use server";

import { revalidatePath } from "next/cache";
import { sql, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcMaterials,
  tcWatchProgress,
  tcTests,
  tcQuestions,
  tcAttempts,
  employees,
  type Employee,
} from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager, TEST_PASS_MARK, type TcLookupOption } from "@/lib/queries/training";
import { notify } from "@/lib/notifications/dispatch";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  CreateMaterialSchema,
  UpdateMaterialSchema,
  AddTcLookupSchema,
  DeleteTcLookupSchema,
  SaveTestSchema,
  SubmitAttemptSchema,
  type TcLookupKind,
} from "@/lib/validators/training";

const PATH = "/training";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Validated kind → table name (kind is enum-checked first, so this is a fixed
// literal — the sql.raw identifier below is injection-safe).
const TC_LOOKUP_TABLE: Record<TcLookupKind, string> = {
  subject: "tc_subjects",
  service: "tc_services",
};

/** Training authoring/review is for managers (have a downline), admins, supers. */
async function requireTrainingManager(): Promise<Employee> {
  const me = await requireWorkspace("training");
  const allowed = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!allowed) throw new Error("Managers only");
  return me;
}

export async function createMaterial(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(tcMaterials)
      .values({
        subjectId: d.subjectId,
        los: d.los,
        filePath: d.filePath,
        fileName: d.fileName,
        fileType: d.fileType,
        videoUrl: d.videoUrl,
        notes: d.notes,
        version: d.version,
        versionNotes: d.versionNotes,
        createdByIds: d.createdByIds,
        assistedByIds: d.assistedByIds,
        partOfInduction: d.partOfInduction,
        inductionDeptIds: d.partOfInduction ? d.inductionDeptIds : [],
        createdById: me.id,
      })
      .returning({ id: tcMaterials.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateMaterial(input: unknown): Promise<Result<{ id: string }>> {
  await requireTrainingManager();
  const parsed = UpdateMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  try {
    await db
      .update(tcMaterials)
      .set({
        subjectId: d.subjectId,
        los: d.los,
        filePath: d.filePath,
        fileName: d.fileName,
        fileType: d.fileType,
        videoUrl: d.videoUrl,
        notes: d.notes,
        version: d.version,
        versionNotes: d.versionNotes,
        createdByIds: d.createdByIds,
        assistedByIds: d.assistedByIds,
        partOfInduction: d.partOfInduction,
        inductionDeptIds: d.partOfInduction ? d.inductionDeptIds : [],
        updatedAt: new Date(),
      })
      .where(eq(tcMaterials.id, d.id));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${d.id}`);
    return { ok: true, id: d.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Archive / unarchive a material (managers + admins). Archived material drops
 *  out of the learner library but stays recoverable. */
export async function archiveMaterial(id: string, archived: boolean): Promise<Result> {
  await requireTrainingManager();
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid material." };
  try {
    await db.update(tcMaterials).set({ archived, updatedAt: new Date() }).where(eq(tcMaterials.id, id));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Permanently delete a material (managers + admins). Cascades to its tests,
 *  questions, attempts and watch records via FK onDelete:cascade. */
export async function deleteMaterial(id: string): Promise<Result> {
  await requireTrainingManager();
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid material." };
  try {
    await db.delete(tcMaterials).where(eq(tcMaterials.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Record that the current employee watched a material (idempotent). */
export async function markWatched(materialId: string): Promise<Result> {
  const me = await requireWorkspace("training");
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return { ok: false, error: "Invalid material." };
  try {
    await db
      .insert(tcWatchProgress)
      .values({ materialId, employeeId: me.id })
      .onConflictDoNothing({
        target: [tcWatchProgress.materialId, tcWatchProgress.employeeId],
      });
    revalidatePath(`${PATH}/${materialId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Add an option to a managed Training dropdown (subject / service). */
export async function addTcLookup(
  kind: TcLookupKind,
  name: string,
): Promise<Result<{ option: TcLookupOption }>> {
  await requireTrainingManager();
  const parsed = AddTcLookupSchema.safeParse({ kind, name });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
  }
  const ident = sql.raw(`"${TC_LOOKUP_TABLE[parsed.data.kind]}"`);
  const value = parsed.data.name;
  try {
    const existing = (await db.execute(
      sql`SELECT id, name, is_active FROM ${ident} WHERE lower(name) = lower(${value}) LIMIT 1`,
    )) as unknown as Array<{ id: string; name: string; is_active: boolean }>;
    if (existing[0]) {
      if (!existing[0].is_active) {
        await db.execute(sql`UPDATE ${ident} SET is_active = true, updated_at = now() WHERE id = ${existing[0].id}`);
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

export async function softDeleteTcLookup(kind: TcLookupKind, id: string): Promise<Result> {
  await requireTrainingManager();
  const parsed = DeleteTcLookupSchema.safeParse({ kind, id });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const ident = sql.raw(`"${TC_LOOKUP_TABLE[parsed.data.kind]}"`);
  try {
    await db.execute(sql`UPDATE ${ident} SET is_active = false, updated_at = now() WHERE id = ${parsed.data.id}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ── Test engine ── */

function norm(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Author (replace) a material's Test 1 (MCQ, 80%) or Test 2 (fill-blank, 75%). */
export async function saveTest(input: unknown): Promise<Result<{ testId: string }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SaveTestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  const passMark = TEST_PASS_MARK[d.kind];
  try {
    // Upsert the test row (one per material+kind).
    const [existing] = await db
      .select({ id: tcTests.id })
      .from(tcTests)
      .where(and(eq(tcTests.materialId, d.materialId), eq(tcTests.kind, d.kind)))
      .limit(1);

    let testId: string;
    if (existing) {
      testId = existing.id;
      await db.update(tcTests).set({ title: d.title, passMark, updatedAt: new Date() }).where(eq(tcTests.id, testId));
      await db.delete(tcQuestions).where(eq(tcQuestions.testId, testId));
    } else {
      const [created] = await db
        .insert(tcTests)
        .values({ materialId: d.materialId, kind: d.kind, title: d.title, passMark })
        .returning({ id: tcTests.id });
      testId = created!.id;
    }

    if (d.questions.length > 0) {
      await db.insert(tcQuestions).values(
        d.questions.map((q, i) => ({
          testId,
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          correctAnswers: q.correctAnswers,
          marks: q.marks,
          position: i,
        })),
      );
    }
    revalidatePath(`/training/${d.materialId}`);
    return { ok: true, testId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Take a test: grade it, record the attempt, ping the manager + employee on fail. */
export async function submitAttempt(input: unknown): Promise<Result<{ score: number; passed: boolean }>> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SubmitAttemptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid submission." };
  }
  const { testId, answers } = parsed.data;

  try {
    const [test] = await db.select().from(tcTests).where(eq(tcTests.id, testId)).limit(1);
    if (!test) return { ok: false, error: "Test not found." };
    const questions = await db.select().from(tcQuestions).where(eq(tcQuestions.testId, testId));
    if (questions.length === 0) return { ok: false, error: "This test has no questions yet." };

    let total = 0;
    let earned = 0;
    for (const q of questions) {
      total += q.marks;
      const ans = answers[q.id];
      if (ans == null) continue;
      const correct = q.correctAnswers ?? [];
      if (q.type === "mcq") {
        if (String(ans) === String(correct[0])) earned += q.marks;
      } else {
        if (correct.some((c) => norm(c) === norm(ans))) earned += q.marks;
      }
    }
    const score = total > 0 ? Math.round((earned / total) * 100) : 0;
    const passed = score >= test.passMark;

    await db.insert(tcAttempts).values({ testId, employeeId: me.id, score, passed, answers });
    revalidatePath(`/training/${test.materialId}`);

    if (!passed) {
      const label = `Test ${test.kind}`;
      const body = `Scored ${score}% on ${label} (pass mark ${test.passMark}%).`;
      notify({ userId: me.id, kind: "training_test_failed", title: `You didn't pass ${label}`, body });
      if (me.managerId) {
        notify({ userId: me.managerId, kind: "training_test_failed", title: `${me.name} failed ${label}`, body: `${me.name} scored ${score}% on ${label} (pass ${test.passMark}%).` });
      } else {
        // Fall back to admins so a failure is never silently unseen.
        const admins = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.isAdmin, true), eq(employees.isActive, true)));
        for (const a of admins) if (a.id !== me.id) notify({ userId: a.id, kind: "training_test_failed", title: `${me.name} failed ${label}`, body });
      }
    }
    return { ok: true, score, passed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
