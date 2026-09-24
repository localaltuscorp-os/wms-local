import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcSelfLearning, tcShares, employees, functions, type Employee } from "@/db/schema";
import { learningVisibleIds } from "@/lib/training/roles";
import { isFounderEmail } from "@/lib/auth/founder";

/** The Self-Learning Library — every visible employee's logged learning. */
export interface SelfLearningLibraryRow {
  id: string;
  employeeName: string;
  functionName: string | null;
  title: string;
  source: string | null;
  minutes: number;
  learnDate: string;
}

export async function listSelfLearningLibrary(
  viewer: Employee,
  from: string,
  to: string,
): Promise<SelfLearningLibraryRow[]> {
  const visible = await learningVisibleIds(viewer);
  const scoped = visible.length > 0 && !(viewer.isAdmin || isFounderEmail(viewer.email));

  const rows = await db
    .select({
      id: tcSelfLearning.id,
      employeeName: employees.name,
      functionName: functions.name,
      title: tcSelfLearning.title,
      source: tcSelfLearning.source,
      minutes: tcSelfLearning.minutes,
      learnDate: tcSelfLearning.learnDate,
    })
    .from(tcSelfLearning)
    .innerJoin(employees, eq(employees.id, tcSelfLearning.employeeId))
    .leftJoin(functions, eq(functions.id, tcSelfLearning.functionId))
    .where(
      and(
        gte(tcSelfLearning.learnDate, from),
        lte(tcSelfLearning.learnDate, to),
        scoped ? inArray(tcSelfLearning.employeeId, visible) : undefined,
      ),
    )
    .orderBy(asc(tcSelfLearning.learnDate));

  return rows.map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    functionName: r.functionName,
    title: r.title,
    source: r.source,
    minutes: r.minutes,
    learnDate: r.learnDate,
  }));
}

/** The Learning-Share Library — weekly shares with the presenter's name. */
export interface ShareLibraryRow {
  id: string;
  employeeName: string;
  topic: string;
  minutes: number;
  weekStart: string;
}

export async function listShareLibrary(from: string, to: string): Promise<ShareLibraryRow[]> {
  const rows = await db
    .select({
      id: tcShares.id,
      employeeName: employees.name,
      topic: tcShares.topic,
      minutes: tcShares.minutes,
      weekStart: tcShares.weekStart,
    })
    .from(tcShares)
    .innerJoin(employees, eq(employees.id, tcShares.employeeId))
    .where(and(gte(tcShares.weekStart, from), lte(tcShares.weekStart, to)))
    .orderBy(asc(tcShares.weekStart));

  return rows.map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    topic: r.topic,
    minutes: r.minutes,
    weekStart: r.weekStart,
  }));
}
