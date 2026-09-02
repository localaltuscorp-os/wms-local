import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcSubjects,
  tcServices,
  tcMaterials,
  tcWatchProgress,
  tcTests,
  tcQuestions,
  tcAttempts,
  employees,
  departments,
} from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export interface TcLookupOption {
  id: string;
  name: string;
}

/** Is this employee a manager — i.e. does anyone report to them? Managers (and
 *  admins/super-admins) get Training authoring + review capabilities. */
export async function isManager(employeeId: string): Promise<boolean> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.managerId, employeeId), eq(employees.isActive, true)));
  return (rows[0]?.n ?? 0) > 0;
}

export async function listTcSubjects(): Promise<TcLookupOption[]> {
  return db
    .select({ id: tcSubjects.id, name: tcSubjects.name })
    .from(tcSubjects)
    .where(eq(tcSubjects.isActive, true))
    .orderBy(asc(tcSubjects.sortOrder), asc(tcSubjects.name));
}

export async function listDepartmentOptions(): Promise<{ value: string; label: string }[]> {
  const rows = await db
    .select({ value: departments.id, label: departments.name })
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.name));
  return rows;
}

export async function listTcServices(): Promise<TcLookupOption[]> {
  return db
    .select({ id: tcServices.id, name: tcServices.name })
    .from(tcServices)
    .where(eq(tcServices.isActive, true))
    .orderBy(asc(tcServices.sortOrder), asc(tcServices.name));
}

export interface TcMaterialRow {
  id: string;
  addedOn: string;
  subject: string | null;
  los: string | null;
  fileName: string | null;
  fileType: string | null;
  hasFile: boolean;
  videoUrl: string | null;
  version: string | null;
  partOfInduction: boolean;
  archived: boolean;
  createdByIds: string[];
  watchedByMe: boolean;
}

/** The material library, newest first, with the viewer's watched flag.
 *  Archived materials are hidden unless `includeArchived` (managers only). */
export async function listMaterials(
  viewerId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<TcMaterialRow[]> {
  const rows = await db
    .select({
      id: tcMaterials.id,
      addedOn: tcMaterials.addedOn,
      subject: tcSubjects.name,
      los: tcMaterials.los,
      fileName: tcMaterials.fileName,
      fileType: tcMaterials.fileType,
      filePath: tcMaterials.filePath,
      videoUrl: tcMaterials.videoUrl,
      version: tcMaterials.version,
      partOfInduction: tcMaterials.partOfInduction,
      archived: tcMaterials.archived,
      createdByIds: tcMaterials.createdByIds,
      watchedAt: tcWatchProgress.watchedAt,
    })
    .from(tcMaterials)
    .leftJoin(tcSubjects, eq(tcSubjects.id, tcMaterials.subjectId))
    .leftJoin(
      tcWatchProgress,
      and(
        eq(tcWatchProgress.materialId, tcMaterials.id),
        eq(tcWatchProgress.employeeId, viewerId),
      ),
    )
    .where(opts.includeArchived ? undefined : eq(tcMaterials.archived, false))
    .orderBy(desc(tcMaterials.createdAt));

  return rows.map((r) => ({
    id: r.id,
    addedOn: r.addedOn,
    subject: r.subject,
    los: r.los,
    fileName: r.fileName,
    fileType: r.fileType,
    hasFile: !!r.filePath,
    videoUrl: r.videoUrl,
    version: r.version,
    partOfInduction: r.partOfInduction,
    archived: r.archived,
    createdByIds: r.createdByIds ?? [],
    watchedByMe: !!r.watchedAt,
  }));
}

export interface TcMaterialDetail {
  id: string;
  addedOn: string;
  subjectId: string | null;
  subject: string | null;
  los: string | null;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null; // fresh signed URL
  videoUrl: string | null;
  notes: string | null;
  version: string | null;
  versionNotes: string | null;
  createdByIds: string[];
  assistedByIds: string[];
  partOfInduction: boolean;
  inductionDeptIds: string[];
  archived: boolean;
  watchedByMe: boolean;
}

/** Full material for the viewer page (incl. a fresh signed URL for the file). */
export async function getMaterial(
  id: string,
  viewerId: string,
): Promise<TcMaterialDetail | null> {
  const [m] = await db
    .select()
    .from(tcMaterials)
    .where(eq(tcMaterials.id, id))
    .limit(1);
  if (!m) return null;

  const [subj] = m.subjectId
    ? await db.select({ name: tcSubjects.name }).from(tcSubjects).where(eq(tcSubjects.id, m.subjectId)).limit(1)
    : [undefined];

  const [watch] = await db
    .select({ at: tcWatchProgress.watchedAt })
    .from(tcWatchProgress)
    .where(and(eq(tcWatchProgress.materialId, id), eq(tcWatchProgress.employeeId, viewerId)))
    .limit(1);

  let fileUrl: string | null = null;
  if (m.filePath) {
    try {
      const { data } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .createSignedUrl(m.filePath, 3600);
      fileUrl = data?.signedUrl ?? null;
    } catch {
      fileUrl = null;
    }
  }

  return {
    id: m.id,
    addedOn: m.addedOn,
    subjectId: m.subjectId,
    subject: subj?.name ?? null,
    los: m.los,
    fileName: m.fileName,
    fileType: m.fileType,
    fileUrl,
    videoUrl: m.videoUrl,
    notes: m.notes,
    version: m.version,
    versionNotes: m.versionNotes,
    createdByIds: m.createdByIds ?? [],
    assistedByIds: m.assistedByIds ?? [],
    partOfInduction: m.partOfInduction,
    inductionDeptIds: m.inductionDeptIds ?? [],
    archived: m.archived,
    watchedByMe: !!watch,
  };
}

/* ── Test engine ── */

export const TEST_PASS_MARK: Record<1 | 2, number> = { 1: 80, 2: 75 };

export interface TcTestSummary {
  kind: 1 | 2;
  testId: string | null;
  passMark: number;
  questionCount: number;
  latest: { score: number; passed: boolean; takenAt: string } | null;
  attemptCount: number;
}

/** Both tests for a material with the viewer's latest attempt + counts. */
export async function getMaterialTests(materialId: string, viewerId: string): Promise<TcTestSummary[]> {
  const tests = await db
    .select({ id: tcTests.id, kind: tcTests.kind, passMark: tcTests.passMark })
    .from(tcTests)
    .where(eq(tcTests.materialId, materialId));

  const out: TcTestSummary[] = [];
  for (const k of [1, 2] as const) {
    const t = tests.find((x) => x.kind === k);
    if (!t) {
      out.push({ kind: k, testId: null, passMark: TEST_PASS_MARK[k], questionCount: 0, latest: null, attemptCount: 0 });
      continue;
    }
    const [qc] = await db.select({ n: sql<number>`count(*)::int` }).from(tcQuestions).where(eq(tcQuestions.testId, t.id));
    const attempts = await db
      .select({ score: tcAttempts.score, passed: tcAttempts.passed, takenAt: tcAttempts.takenAt })
      .from(tcAttempts)
      .where(and(eq(tcAttempts.testId, t.id), eq(tcAttempts.employeeId, viewerId)))
      .orderBy(desc(tcAttempts.takenAt));
    out.push({
      kind: k,
      testId: t.id,
      passMark: t.passMark,
      questionCount: qc?.n ?? 0,
      latest: attempts[0] ? { score: attempts[0].score, passed: attempts[0].passed, takenAt: attempts[0].takenAt.toISOString() } : null,
      attemptCount: attempts.length,
    });
  }
  return out;
}

export interface TakingQuestion {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  marks: number;
}
export interface TakingTest {
  testId: string;
  materialId: string;
  kind: number;
  passMark: number;
  title: string | null;
  questions: TakingQuestion[];
}

/** A test for an employee to take — correct answers stripped out. */
export async function getTestForTaking(testId: string): Promise<TakingTest | null> {
  const [t] = await db.select().from(tcTests).where(eq(tcTests.id, testId)).limit(1);
  if (!t) return null;
  const qs = await db.select().from(tcQuestions).where(eq(tcQuestions.testId, testId)).orderBy(asc(tcQuestions.position));
  return {
    testId: t.id,
    materialId: t.materialId,
    kind: t.kind,
    passMark: t.passMark,
    title: t.title,
    questions: qs.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options ?? [], marks: q.marks })),
  };
}

export interface AuthoringQuestion {
  type: string;
  prompt: string;
  options: string[];
  correctAnswers: string[];
  marks: number;
}
/** Existing questions for a material's test (with answers) — for authoring. */
export async function getTestForAuthoring(materialId: string, kind: number): Promise<{ title: string | null; questions: AuthoringQuestion[] }> {
  const [t] = await db.select().from(tcTests).where(and(eq(tcTests.materialId, materialId), eq(tcTests.kind, kind))).limit(1);
  if (!t) return { title: null, questions: [] };
  const qs = await db.select().from(tcQuestions).where(eq(tcQuestions.testId, t.id)).orderBy(asc(tcQuestions.position));
  return {
    title: t.title,
    questions: qs.map((q) => ({ type: q.type, prompt: q.prompt, options: q.options ?? [], correctAnswers: q.correctAnswers ?? [], marks: q.marks })),
  };
}

/* ── Induction (slice 3) + dashboard (slice 5) ── */

export interface InductionItem {
  id: string;
  subject: string | null;
  los: string | null;
  fileName: string | null;
  fileType: string | null;
  videoUrl: string | null;
  watched: boolean;
  test1Passed: boolean | null; // null = no test
  test2Passed: boolean | null;
  complete: boolean;
}

/** Induction material assigned to an employee — all induction-flagged material
 *  tagged for their department — with watch + test status. */
export async function getInductionForEmployee(employeeId: string, departmentId: string | null): Promise<InductionItem[]> {
  if (!departmentId) return [];
  const mats = await db
    .select({ id: tcMaterials.id, subject: tcSubjects.name, los: tcMaterials.los, fileName: tcMaterials.fileName, fileType: tcMaterials.fileType, videoUrl: tcMaterials.videoUrl })
    .from(tcMaterials)
    .leftJoin(tcSubjects, eq(tcSubjects.id, tcMaterials.subjectId))
    .where(and(eq(tcMaterials.partOfInduction, true), sql`${departmentId} = ANY(${tcMaterials.inductionDeptIds})`))
    .orderBy(asc(tcMaterials.createdAt));

  const out: InductionItem[] = [];
  for (const m of mats) {
    const [w] = await db.select({ n: sql<number>`count(*)::int` }).from(tcWatchProgress).where(and(eq(tcWatchProgress.materialId, m.id), eq(tcWatchProgress.employeeId, employeeId)));
    const watched = (w?.n ?? 0) > 0;
    const tests = await db.select({ id: tcTests.id, kind: tcTests.kind }).from(tcTests).where(eq(tcTests.materialId, m.id));
    async function passed(testId: string): Promise<boolean> {
      const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(tcAttempts).where(and(eq(tcAttempts.testId, testId), eq(tcAttempts.employeeId, employeeId), eq(tcAttempts.passed, true)));
      return (p?.n ?? 0) > 0;
    }
    const t1 = tests.find((t) => t.kind === 1);
    const t2 = tests.find((t) => t.kind === 2);
    const test1Passed = t1 ? await passed(t1.id) : null;
    const test2Passed = t2 ? await passed(t2.id) : null;
    const testsOk = (test1Passed ?? true) && (test2Passed ?? true);
    out.push({ id: m.id, subject: m.subject, los: m.los, fileName: m.fileName, fileType: m.fileType, videoUrl: m.videoUrl, watched, test1Passed, test2Passed, complete: watched && testsOk });
  }
  return out;
}

export interface TrainingDashboardStats {
  materials: number;
  inductionMaterials: number;
  employees: number;
  watches: number;
  attempts: number;
  passRate: number | null;
  failedTests: number;
  bySubject: { subject: string; count: number }[];
}

export async function getTrainingDashboardStats(): Promise<TrainingDashboardStats> {
  const [mat] = await db.select({ n: sql<number>`count(*)::int` }).from(tcMaterials);
  const [ind] = await db.select({ n: sql<number>`count(*)::int` }).from(tcMaterials).where(eq(tcMaterials.partOfInduction, true));
  const [emp] = await db.select({ n: sql<number>`count(*)::int` }).from(employees).where(eq(employees.isActive, true));
  const [wat] = await db.select({ n: sql<number>`count(*)::int` }).from(tcWatchProgress);
  const [att] = await db.select({ n: sql<number>`count(*)::int` }).from(tcAttempts);
  const [passed] = await db.select({ n: sql<number>`count(*)::int` }).from(tcAttempts).where(eq(tcAttempts.passed, true));
  const [failed] = await db.select({ n: sql<number>`count(*)::int` }).from(tcAttempts).where(eq(tcAttempts.passed, false));
  const subj = await db
    .select({ subject: tcSubjects.name, count: sql<number>`count(*)::int` })
    .from(tcMaterials)
    .leftJoin(tcSubjects, eq(tcSubjects.id, tcMaterials.subjectId))
    .groupBy(tcSubjects.name);
  const attempts = att?.n ?? 0;
  return {
    materials: mat?.n ?? 0,
    inductionMaterials: ind?.n ?? 0,
    employees: emp?.n ?? 0,
    watches: wat?.n ?? 0,
    attempts,
    passRate: attempts > 0 ? Math.round(((passed?.n ?? 0) / attempts) * 100) : null,
    failedTests: failed?.n ?? 0,
    bySubject: subj.map((s) => ({ subject: s.subject ?? "Unsorted", count: s.count })).sort((a, b) => b.count - a.count),
  };
}
