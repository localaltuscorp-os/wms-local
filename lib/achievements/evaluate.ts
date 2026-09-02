import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  achievementsEarned,
  documents,
  tasks,
  taskEvents,
} from "@/db/schema";
import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type UserActivitySnapshot,
} from "./definitions";

export interface EvaluatedAchievement {
  def: AchievementDefinition;
  earned: boolean;
  earnedAt: Date | string | null;
  progress: { current: number; target: number };
}

/**
 * Build a snapshot of the user's activity. One DB round-trip per metric
 * (parallel). Cheap at our scale (single-digit ms per query on 21 users).
 */
export async function buildActivitySnapshot(
  employeeId: string,
): Promise<UserActivitySnapshot> {
  const [
    doneLifetimeRow,
    doneThisWeekRow,
    doneThisMonthRow,
    onTimeRows,
    docsRow,
    commentsRow,
    streakRows,
  ] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.doerId, employeeId), eq(tasks.status, "done"))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        sql`${tasks.doerId} = ${employeeId}
            and ${tasks.status} = 'done'
            and ${tasks.completedAt} >= date_trunc('week', now())`,
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        sql`${tasks.doerId} = ${employeeId}
            and ${tasks.status} = 'done'
            and ${tasks.completedAt} >= date_trunc('month', now())`,
      ),
    db
      .select({
        total: sql<number>`count(*)::int`,
        onTime: sql<number>`sum(case when ${tasks.completedAt} <= ${tasks.dueAt} then 1 else 0 end)::int`,
      })
      .from(tasks)
      .where(
        sql`${tasks.doerId} = ${employeeId}
            and ${tasks.status} = 'done'
            and ${tasks.completedAt} is not null
            and ${tasks.dueAt} is not null`,
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.uploadedById, employeeId)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(taskEvents)
      .where(
        and(eq(taskEvents.actorId, employeeId), eq(taskEvents.eventType, "commented")),
      ),
    // Distinct completion days in the last 365, for streak math.
    db
      .select({
        day: sql<string>`(${tasks.completedAt} AT TIME ZONE 'UTC')::date`,
      })
      .from(tasks)
      .where(
        sql`${tasks.doerId} = ${employeeId}
            and ${tasks.status} = 'done'
            and ${tasks.completedAt} >= now() - interval '365 days'`,
      )
      .groupBy(sql`(${tasks.completedAt} AT TIME ZONE 'UTC')::date`)
      .orderBy(sql`(${tasks.completedAt} AT TIME ZONE 'UTC')::date asc`),
  ]);

  // Compute current + longest streaks from the day-set.
  const days = streakRows.map((r) => r.day);
  const daySet = new Set(days);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let current = 0;
  const cursor = new Date(today);
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const dt = new Date(d);
    if (
      prev &&
      Math.round((dt.getTime() - prev.getTime()) / 86400000) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = dt;
  }

  const onTime = onTimeRows[0]?.onTime ?? 0;
  const total = onTimeRows[0]?.total ?? 0;
  const onTimeRate = total > 0 ? onTime / total : 0;

  return {
    tasksDoneLifetime: doneLifetimeRow[0]?.c ?? 0,
    tasksDoneThisWeek: doneThisWeekRow[0]?.c ?? 0,
    tasksDoneThisMonth: doneThisMonthRow[0]?.c ?? 0,
    onTimeRate,
    avgResponseMinutes: 45, // TODO: derive from first-comment-after-assignment
    currentStreakDays: current,
    documentsUploaded: docsRow[0]?.c ?? 0,
    commentsWritten: commentsRow[0]?.c ?? 0,
    longestStreakDays: longest,
  };
}

/**
 * Evaluate all achievements for one user. Reads the earned rows so the
 * UI can show earned-at timestamps. Does NOT write earned rows — that's
 * the recompute cron's job (so a profile view doesn't grant a badge).
 */
export async function evaluateAchievements(
  employeeId: string,
): Promise<EvaluatedAchievement[]> {
  const [snapshot, earnedRows] = await Promise.all([
    buildActivitySnapshot(employeeId),
    db
      .select({
        key: achievementsEarned.achievementKey,
        earnedAt: achievementsEarned.earnedAt,
      })
      .from(achievementsEarned)
      .where(eq(achievementsEarned.employeeId, employeeId)),
  ]);

  const earnedMap = new Map(
    earnedRows.map((r) => [r.key, r.earnedAt] as const),
  );

  return ACHIEVEMENTS.map((def) => {
    const evaluation = def.evaluate(snapshot);
    const earnedAt = earnedMap.get(def.key) ?? null;
    return {
      def,
      earned: evaluation.earned || !!earnedAt,
      earnedAt,
      progress: evaluation.progress,
    };
  });
}
