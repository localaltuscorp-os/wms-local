import "server-only";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, employees, tasks, weeklyGoals, dailyChecklist } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { istYmd } from "@/lib/weekly-goals/week";
import { PRIORITY_LABELS } from "@/db/enums";
import {
  PREVIEW_LIMIT,
  type ActivityCategory,
  type ActivityPreview,
  type ActivityPreviewItem,
  type ActivitySplitKey,
  type ActivityPeriod,
  activityWindow,
  daysBefore,
} from "@/lib/dashboard/manager-activity-contract";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/**
 * The item list behind ONE activity cell — what the hover popover shows.
 *
 * Fetched on hover, never with the board: the board renders ~11 managers x 3
 * families x (1 + reports) cells, and pre-loading every list would be hundreds
 * of item queries for the handful a reader ever points at.
 *
 * The A/B attribution repeats the board's rule exactly (see
 * manager-activity-board.ts) so a popover can never disagree with the count it
 * hangs off: DELEGATE = originated by this manager, COUNTERPART = originated by
 * anyone else, and `gt` is both together.
 */

/** Does an item with this originator belong in the requested split? */
function inSplit(originatorId: string | null, managerId: string, split: ActivitySplitKey) {
  if (split === "gt") return true;
  const isDelegate = originatorId != null && originatorId === managerId;
  return split === "delegate" ? isDelegate : !isDelegate;
}

/**
 * The SLA line for a deadline: how late it is, or when it falls.
 *
 * Real day maths rather than a bare date, because "21 Aug" makes the reader do
 * the subtraction and "6d overdue" does not. Compared on whole IST days so a
 * task due today never reads as overdue by a few hours.
 */
function slaFor(
  due: string | Date | null,
  todayYmd: string,
): { text: string | null; tone: "overdue" | "today" | null } {
  if (!due) return { text: null, tone: null };
  const d = due instanceof Date ? due : new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { text: null, tone: null };
  const dueYmd = d.toISOString().slice(0, 10);
  const days = Math.round(
    (Date.parse(`${dueYmd}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) / 86400000,
  );
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `${n}d overdue`, tone: "overdue" };
  }
  if (days === 0) return { text: "Due today", tone: "today" };
  return { text: `Due ${ymdLabel(due)}`, tone: null };
}

function ymdLabel(v: string | Date | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export async function managerActivityPreview(input: {
  managerId: string;
  memberId: string;
  category: ActivityCategory;
  split: ActivitySplitKey;
  period: ActivityPeriod;
  custom?: { from: string; to: string } | null;
  now?: Date;
}): Promise<ActivityPreview> {
  const { managerId, memberId, category, split, period } = input;
  // Same window helper the board uses, so a preview can never be computed over
  // a different period than the count it hangs off.
  const { from, to } = activityWindow(period, istYmd(input.now ?? new Date()), input.custom);

  let items: ActivityPreviewItem[] = [];

  if (category === "goals") {
    const rows = await withRetry(
      () =>
        db
          .select({
            id: weeklyGoals.id,
            subject: weeklyGoals.subject,
            targetDone: weeklyGoals.targetDone,
            targetDate: weeklyGoals.targetDate,
            weekStart: weeklyGoals.weekStart,
            originatorId: weeklyGoals.createdById,
            ownerName: employees.name,
          })
          .from(weeklyGoals)
          .leftJoin(employees, eq(weeklyGoals.employeeId, employees.id))
          .where(
            and(
              eq(weeklyGoals.employeeId, memberId),
              eq(weeklyGoals.archived, false),
              gte(weeklyGoals.weekStart, daysBefore(from, 6)),
              lte(weeklyGoals.weekStart, to),
            ),
          )
          .orderBy(desc(weeklyGoals.weekStart)),
      RETRY,
    );
    items = rows
      .filter((r) => inSplit(r.originatorId, managerId, split))
      .map((r) => ({
        id: r.id,
        // `weeklyGoals` has no `title`; the goal text is `subject`, with
        // `targetDone` (the "what does done look like" field) as the fallback.
        title: r.subject?.trim() || r.targetDone?.trim() || "Untitled goal",
        meta: r.ownerName ?? null,
        // Target date when the goal has one, else the week it belongs to —
        // "no date" on every row would make the column pointless.
        ...(() => {
          const sla = slaFor(r.targetDate, to);
          return {
            trailing: sla.text ?? ymdLabel(r.weekStart),
            trailingTone: sla.tone,
          };
        })(),
        tone: null,
      }));
  } else if (category === "tasks") {
    const rows = await withRetry(
      () =>
        db
          .select({
            id: tasks.id,
            description: tasks.description,
            priority: tasks.priority,
            dueAt: tasks.dueAt,
            originatorId: tasks.initiatorId,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.doerId, memberId),
              gte(sql`(${tasks.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`, from),
              lte(sql`(${tasks.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`, to),
            ),
          )
          .orderBy(desc(tasks.createdAt)),
      RETRY,
    );
    items = rows
      .filter((r) => inSplit(r.originatorId, managerId, split))
      .map((r) => {
        const sla = slaFor(r.dueAt, to);
        return {
          id: r.id,
          // DESCRIPTION ONLY. This used to fall back through `subject` and then
          // `title`, and both fallbacks were the problem: `subject` is a
          // category ("WMS App", "App"), so a run of rows all read the same,
          // and `title` in this schema is the CLIENT NAME — the New Task form's
          // "Client Name" field writes straight to tasks.title. Neither says
          // what the work is. A task with no description says so plainly
          // instead of borrowing a label that misleads.
          title: r.description?.trim() || "Untitled task",
          meta: PRIORITY_LABELS[r.priority] ?? null,
          trailing: sla.text,
          trailingTone: sla.tone,
          // Critical is the only priority worth a red badge; the rest are noise
          // if they all shout.
          tone: r.priority === "imp_urgent" ? ("urgent" as const) : null,
        };
      });
  } else {
    const rows = await withRetry(
      () =>
        db
          .select({
            id: dailyChecklist.id,
            title: dailyChecklist.title,
            done: dailyChecklist.done,
            planDate: dailyChecklist.planDate,
            closedAt: dailyChecklist.closedAt,
            committedAt: dailyChecklist.committedAt,
            taskInitiatorId: tasks.initiatorId,
            goalCreatorId: weeklyGoals.createdById,
            employeeId: dailyChecklist.employeeId,
          })
          .from(dailyChecklist)
          .leftJoin(tasks, eq(dailyChecklist.taskId, tasks.id))
          .leftJoin(weeklyGoals, eq(dailyChecklist.goalId, weeklyGoals.id))
          .where(
            and(
              eq(dailyChecklist.employeeId, memberId),
              gte(dailyChecklist.planDate, from),
              lte(dailyChecklist.planDate, to),
            ),
          )
          .orderBy(desc(dailyChecklist.planDate)),
      RETRY,
    );
    items = rows
      .filter((r) =>
        inSplit(r.taskInitiatorId ?? r.goalCreatorId ?? r.employeeId, managerId, split),
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        meta: r.done ? "Done" : "Pending",
        // The time log: when it was closed if it is closed, else the day it was
        // committed to. Both are real timestamps, so neither is invented.
        trailing: ymdLabel(r.closedAt ?? r.committedAt ?? r.planDate),
        // A time log is not a deadline — nothing here can be "overdue".
        trailingTone: null,
        tone: r.done ? ("done" as const) : ("pending" as const),
      }));
  }

  return {
    total: items.length,
    items: items.slice(0, PREVIEW_LIMIT),
  };
}
