import "server-only";
import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db, tcSelfLearning, tcShares, tcShareFeedback, employees } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { currentWeekStart } from "@/lib/weekly-goals/week";

/**
 * Read layer for the personal Skill-Upgrade surfaces — Self-Learning log + the
 * Weekly Share. server-only. Every read used on a page is wrapped in withRetry
 * so a stale pooled connection self-heals (these are on-demand surfaces, not the
 * hot dashboard path).
 *
 * Self-Learning (books/videos/YT, with evidence) and the once-a-week 10-minute
 * Share (with peer feedback 1–5) both feed the PMS Skill-Upgrade pillar; the
 * pure score engine reads the same `tc_self_learning` / `tc_shares` rows these
 * surfaces write.
 */

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

export interface SelfLearningRow {
  id: string;
  learnDate: string; // 'YYYY-MM-DD'
  kind: "book" | "video" | "youtube" | "other";
  title: string;
  sourceUrl: string | null;
  minutes: number;
  evidenceUrl: string | null;
  evidencePath: string | null;
  notes: string | null;
}

/** One employee's self-learning entries inside an inclusive month window
 *  [monthStart, monthEnd), newest first. */
export async function listSelfLearning(
  employeeId: string,
  monthStart: string,
  monthEnd: string,
): Promise<SelfLearningRow[]> {
  const rows = await withRetry(
    () =>
      db
        .select({
          id: tcSelfLearning.id,
          learnDate: tcSelfLearning.learnDate,
          kind: tcSelfLearning.kind,
          title: tcSelfLearning.title,
          sourceUrl: tcSelfLearning.sourceUrl,
          minutes: tcSelfLearning.minutes,
          evidenceUrl: tcSelfLearning.evidenceUrl,
          evidencePath: tcSelfLearning.evidencePath,
          notes: tcSelfLearning.notes,
        })
        .from(tcSelfLearning)
        .where(
          and(
            eq(tcSelfLearning.employeeId, employeeId),
            gte(tcSelfLearning.learnDate, monthStart),
            lt(tcSelfLearning.learnDate, monthEnd),
          ),
        )
        .orderBy(desc(tcSelfLearning.learnDate), desc(tcSelfLearning.id)),
    { ...RETRY, label: "self-learning-list" },
  );
  return rows.map((r) => ({
    id: r.id,
    learnDate: r.learnDate,
    kind: r.kind as SelfLearningRow["kind"],
    title: r.title,
    sourceUrl: r.sourceUrl,
    minutes: r.minutes ?? 0,
    evidenceUrl: r.evidenceUrl,
    evidencePath: r.evidencePath,
    notes: r.notes,
  }));
}

/** Total self-learning minutes the employee has logged in the current IST month. */
export async function selfLearnMinutesThisMonth(employeeId: string): Promise<number> {
  const now = new Date();
  const istYmd = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const monthStart = `${istYmd.slice(0, 7)}-01`;
  const [y, m] = monthStart.split("-").map(Number);
  const next = m === 12 ? { y: y! + 1, m: 1 } : { y: y!, m: m! + 1 };
  const monthEnd = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
  const rows = await withRetry(
    () =>
      db
        .select({ m: sql<number>`coalesce(sum(${tcSelfLearning.minutes}),0)::int` })
        .from(tcSelfLearning)
        .where(
          and(
            eq(tcSelfLearning.employeeId, employeeId),
            gte(tcSelfLearning.learnDate, monthStart),
            lt(tcSelfLearning.learnDate, monthEnd),
          ),
        ),
    { ...RETRY, label: "self-learning-minutes" },
  );
  return rows[0]?.m ?? 0;
}

export interface ThisWeekShare {
  id: string;
  weekStart: string;
  topic: string | null;
  minutes: number;
  videoUrl: string | null;
  videoPath: string | null;
  notes: string | null;
  avgRating: number | null;
  ratingCount: number;
}

/** The employee's Share for the CURRENT ISO week (Monday IST), or null if not
 *  yet done. Includes the peer-feedback summary so the form can reflect it. */
export async function getThisWeekShare(employeeId: string): Promise<ThisWeekShare | null> {
  const weekStart = currentWeekStart();
  const rows = await withRetry(
    () =>
      db
        .select({
          id: tcShares.id,
          weekStart: tcShares.weekStart,
          topic: tcShares.topic,
          minutes: tcShares.minutes,
          videoUrl: tcShares.videoUrl,
          videoPath: tcShares.videoPath,
          notes: tcShares.notes,
        })
        .from(tcShares)
        .where(and(eq(tcShares.employeeId, employeeId), eq(tcShares.weekStart, weekStart)))
        .limit(1),
    { ...RETRY, label: "this-week-share" },
  );
  const row = rows[0];
  if (!row) return null;
  const fb = await withRetry(
    () =>
      db
        .select({
          avg: sql<number>`avg(${tcShareFeedback.rating})`,
          n: sql<number>`count(*)::int`,
        })
        .from(tcShareFeedback)
        .where(eq(tcShareFeedback.shareId, row.id)),
    { ...RETRY, label: "this-week-share-feedback" },
  );
  return {
    id: row.id,
    weekStart: row.weekStart,
    topic: row.topic,
    minutes: row.minutes ?? 0,
    videoUrl: row.videoUrl,
    videoPath: row.videoPath,
    notes: row.notes,
    avgRating: fb[0]?.avg != null ? Number(fb[0].avg) : null,
    ratingCount: fb[0]?.n ?? 0,
  };
}

export interface ShareForFeedback {
  id: string;
  employeeId: string;
  employeeName: string;
  weekStart: string;
  topic: string | null;
  minutes: number;
  videoUrl: string | null;
  notes: string | null;
  avgRating: number | null;
  ratingCount: number;
  myRating: number | null;
  myComment: string | null;
}

/** Recent Shares by OTHER colleagues that the viewer can give peer feedback on,
 *  newest week first. Includes the aggregate rating + the viewer's own existing
 *  rating/comment (so the feed can pre-fill and let them revise). */
export async function listSharesForFeedback(opts: {
  excludeEmployeeId: string;
  limit?: number;
}): Promise<ShareForFeedback[]> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 60);
  const rows = await withRetry(
    () =>
      db
        .select({
          id: tcShares.id,
          employeeId: tcShares.employeeId,
          employeeName: employees.name,
          weekStart: tcShares.weekStart,
          topic: tcShares.topic,
          minutes: tcShares.minutes,
          videoUrl: tcShares.videoUrl,
          notes: tcShares.notes,
          avgRating: sql<number | null>`(
            select avg(sf.rating) from tc_share_feedback sf where sf.share_id = ${tcShares.id}
          )`,
          ratingCount: sql<number>`(
            select count(*)::int from tc_share_feedback sf where sf.share_id = ${tcShares.id}
          )`,
          myRating: tcShareFeedback.rating,
          myComment: tcShareFeedback.comment,
        })
        .from(tcShares)
        .innerJoin(employees, eq(employees.id, tcShares.employeeId))
        .leftJoin(
          tcShareFeedback,
          and(eq(tcShareFeedback.shareId, tcShares.id), eq(tcShareFeedback.raterId, opts.excludeEmployeeId)),
        )
        .where(and(ne(tcShares.employeeId, opts.excludeEmployeeId), eq(employees.isActive, true)))
        .orderBy(desc(tcShares.weekStart), desc(tcShares.createdAt))
        .limit(limit),
    { ...RETRY, label: "shares-for-feedback" },
  );
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    weekStart: r.weekStart,
    topic: r.topic,
    minutes: r.minutes ?? 0,
    videoUrl: r.videoUrl,
    notes: r.notes,
    avgRating: r.avgRating != null ? Number(r.avgRating) : null,
    ratingCount: Number(r.ratingCount ?? 0),
    myRating: r.myRating ?? null,
    myComment: r.myComment ?? null,
  }));
}
