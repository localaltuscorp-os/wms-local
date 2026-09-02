import "server-only";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db, dailyChecklist, dailyChecklistReviews, employees } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { isSuperAdmin } from "@/lib/auth/super-admin";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/** Can `me` review `employeeId`'s checklist? admin/super, or their manager. */
export async function canReviewChecklist(
  me: { id: string; isAdmin: boolean; email: string },
  employeeId: string,
): Promise<boolean> {
  if (me.isAdmin || isSuperAdmin(me.email)) return true;
  if (employeeId === me.id) return false; // you don't "review" your own
  const downline = await getDownlineIds(me.id).catch((): string[] => []);
  return downline.includes(employeeId);
}

export interface ChecklistDayItem {
  id: string;
  title: string;
  origin: "goal_related" | "standalone";
  taskId: string | null;
  done: boolean;
  doneNote: string | null;
}
export interface ChecklistDayReview {
  status: string;
  note: string | null;
  reviewerId: string | null;
  reviewedAt: Date;
}
export interface ChecklistDay {
  date: string;
  items: ChecklistDayItem[];
  review: ChecklistDayReview | null;
}

/** A member's recent daily checklists (last `days`), grouped by day, newest first,
 *  each with its manager-review status. */
export async function memberChecklistDays(
  employeeId: string,
  days = 21,
): Promise<{ name: string | null; days: ChecklistDay[] }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [rows, reviews, emp] = await Promise.all([
    withRetry(
      () =>
        db
          .select({
            id: dailyChecklist.id,
            planDate: dailyChecklist.planDate,
            title: dailyChecklist.title,
            origin: dailyChecklist.origin,
            taskId: dailyChecklist.taskId,
            done: dailyChecklist.done,
            doneNote: dailyChecklist.doneNote,
          })
          .from(dailyChecklist)
          .where(and(eq(dailyChecklist.employeeId, employeeId), gte(dailyChecklist.planDate, since)))
          .orderBy(desc(dailyChecklist.planDate), asc(dailyChecklist.position)),
      { ...RETRY, label: "review-items" },
    ),
    withRetry(
      () =>
        db
          .select({
            planDate: dailyChecklistReviews.planDate,
            status: dailyChecklistReviews.status,
            note: dailyChecklistReviews.note,
            reviewerId: dailyChecklistReviews.reviewerId,
            updatedAt: dailyChecklistReviews.updatedAt,
          })
          .from(dailyChecklistReviews)
          .where(and(eq(dailyChecklistReviews.employeeId, employeeId), gte(dailyChecklistReviews.planDate, since))),
      { ...RETRY, label: "review-reviews" },
    ),
    withRetry(
      () => db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId)).limit(1),
      { ...RETRY, label: "review-name" },
    ),
  ]);

  const reviewByDate = new Map(
    reviews.map((r) => [r.planDate, { status: r.status, note: r.note, reviewerId: r.reviewerId, reviewedAt: new Date(r.updatedAt) }]),
  );
  const byDate = new Map<string, ChecklistDayItem[]>();
  for (const r of rows) {
    const list = byDate.get(r.planDate) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      origin: r.origin as "goal_related" | "standalone",
      taskId: r.taskId,
      done: r.done,
      doneNote: r.doneNote,
    });
    byDate.set(r.planDate, list);
  }
  const daysOut: ChecklistDay[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items, review: reviewByDate.get(date) ?? null }));

  return { name: emp[0]?.name ?? null, days: daysOut };
}
