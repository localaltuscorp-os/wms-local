import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, employees, tasks, weeklyGoals, dailyChecklist } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { isFounderEmail } from "@/lib/auth/founder";
import { daysBefore } from "@/lib/dashboard/manager-activity-contract";
import {
  emptyRelationSplit,
  type RelationSplit,
  type WorkloadRelation,
} from "@/lib/dashboard/creator-workload-contract";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/**
 * THE ONE PLACE THE FIVE-WAY DELEGATION SPLIT IS COMPUTED.
 *
 * Two boards need it — the flat "who is creating how much work" table and the
 * nested "who is delegating, and how much" board — and they must never disagree
 * about a number. Two copies of this classification would be two copies of the
 * founder rule, the downline walk and the commitment-originator fallback, and
 * the first one to be edited alone would make the two sections contradict each
 * other on the same screen.
 *
 * ── WHERE THE ORIGINATOR COMES FROM ──────────────────────────────────────
 *   tasks        → `tasks.initiatorId` created it, `tasks.doerId` carries it.
 *   weekly goals → `weeklyGoals.createdById` / `weeklyGoals.employeeId`.
 *   commitments  → no originator column, so it is derived: the linked task's
 *                  initiator, else the linked goal's creator, else the owner
 *                  (a standalone My Day row is self-authored by definition).
 *
 * ── THE FIVE-WAY SPLIT ───────────────────────────────────────────────────
 * Given a creator C and a recipient R, in this precedence:
 *
 *   SELF        R is C.
 *   FOUNDER     R is the founder. Checked BEFORE upward on purpose — the
 *               founder also sits up everyone's chain, and "sent it to the
 *               founder" is the fact worth surfacing, not "sent it upward".
 *   DOWNWARD    R is anywhere in C's downline, not merely a direct report. A
 *               task handed to a report's report is still work C pushed DOWN;
 *               filing it as Counterpart would say the opposite.
 *   UPWARD      R is anywhere in C's management chain.
 *   COUNTERPART Everyone else — peers, other departments, unrelated lines.
 *
 * The five partition every item, so a family total is a true count.
 */

/** One person's created work, per family, each split five ways. */
export interface CreatorFamilySplits {
  goals: RelationSplit;
  tasks: RelationSplit;
  commitments: RelationSplit;
}

export const emptyFamilySplits = (): CreatorFamilySplits => ({
  goals: emptyRelationSplit(),
  tasks: emptyRelationSplit(),
  commitments: emptyRelationSplit(),
});

export interface OrgPerson {
  id: string;
  name: string;
  managerId: string | null;
}

export interface CreatorSplitResult {
  /** Every ACTIVE employee, in no particular order. */
  people: OrgPerson[];
  /** manager id → their direct reports. Absent key means no reports. */
  reportsOf: Map<string, OrgPerson[]>;
  /** creator id → what they created in the window. Every active person has an
   *  entry, so a person who created nothing still reads as a row of zeroes
   *  rather than being silently absent. */
  splits: Map<string, CreatorFamilySplits>;
}

export async function loadCreatorSplits(
  from: string,
  to: string,
): Promise<CreatorSplitResult> {
  const people = await withRetry(
    () =>
      db
        .select({
          id: employees.id,
          name: employees.name,
          email: employees.email,
          managerId: employees.managerId,
        })
        .from(employees)
        .where(eq(employees.isActive, true)),
    RETRY,
  );

  const reportsOf = new Map<string, OrgPerson[]>();
  const managerOf = new Map<string, string | null>();
  const founders = new Set<string>();
  for (const p of people) {
    managerOf.set(p.id, p.managerId ?? null);
    // Keyed off the email, never `manager_id IS NULL` — managers currently have
    // no manager assigned and must not all count as founders. See
    // lib/auth/founder.ts.
    if (isFounderEmail(p.email)) founders.add(p.id);
    if (!p.managerId) continue;
    const list = reportsOf.get(p.managerId) ?? [];
    list.push({ id: p.id, name: p.name, managerId: p.managerId });
    reportsOf.set(p.managerId, list);
  }

  /** Everyone below `id`, transitively. Cycle-guarded — a reporting loop from
   *  a bad admin edit would otherwise spin here forever. */
  const downlineCache = new Map<string, Set<string>>();
  function downlineOf(id: string): Set<string> {
    const hit = downlineCache.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    const queue = (reportsOf.get(id) ?? []).map((r) => r.id);
    while (queue.length > 0) {
      const next = queue.pop()!;
      if (next === id || out.has(next)) continue;
      out.add(next);
      for (const r of reportsOf.get(next) ?? []) queue.push(r.id);
    }
    downlineCache.set(id, out);
    return out;
  }

  /** Everyone above `id`, transitively. Same cycle guard. */
  const uplineCache = new Map<string, Set<string>>();
  function uplineOf(id: string): Set<string> {
    const hit = uplineCache.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    let cursor = managerOf.get(id) ?? null;
    while (cursor && cursor !== id && !out.has(cursor)) {
      out.add(cursor);
      cursor = managerOf.get(cursor) ?? null;
    }
    uplineCache.set(id, out);
    return out;
  }

  function classify(creatorId: string, recipientId: string): WorkloadRelation {
    if (creatorId === recipientId) return "self";
    if (founders.has(recipientId)) return "founder";
    if (downlineOf(creatorId).has(recipientId)) return "downward";
    if (uplineOf(creatorId).has(recipientId)) return "upward";
    return "counterpart";
  }

  const splits = new Map<string, CreatorFamilySplits>();
  for (const p of people) splits.set(p.id, emptyFamilySplits());

  if (people.length === 0) return { people, reportsOf, splits };

  const scopeIds = people.map((p) => p.id);

  const [goalRows, taskRows, commitRows] = await Promise.all([
    // Weekly goals whose week OVERLAPS the window. `weekStart` is the Monday,
    // so the window is widened six days or a week that began before it opened
    // would be missed entirely.
    withRetry(
      () =>
        db
          .select({
            recipientId: weeklyGoals.employeeId,
            creatorId: weeklyGoals.createdById,
          })
          .from(weeklyGoals)
          .where(
            and(
              inArray(weeklyGoals.employeeId, scopeIds),
              eq(weeklyGoals.archived, false),
              gte(weeklyGoals.weekStart, daysBefore(from, 6)),
              lte(weeklyGoals.weekStart, to),
            ),
          ),
      RETRY,
    ),
    withRetry(
      () =>
        db
          .select({ recipientId: tasks.doerId, creatorId: tasks.initiatorId })
          .from(tasks)
          .where(
            and(
              inArray(tasks.doerId, scopeIds),
              gte(sql`(${tasks.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`, from),
              lte(sql`(${tasks.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`, to),
            ),
          ),
      RETRY,
    ),
    withRetry(
      () =>
        db
          .select({
            recipientId: dailyChecklist.employeeId,
            taskInitiatorId: tasks.initiatorId,
            goalCreatorId: weeklyGoals.createdById,
          })
          .from(dailyChecklist)
          .leftJoin(tasks, eq(dailyChecklist.taskId, tasks.id))
          .leftJoin(weeklyGoals, eq(dailyChecklist.goalId, weeklyGoals.id))
          .where(
            and(
              inArray(dailyChecklist.employeeId, scopeIds),
              gte(dailyChecklist.planDate, from),
              lte(dailyChecklist.planDate, to),
            ),
          ),
      RETRY,
    ),
  ]);

  function credit(
    family: keyof CreatorFamilySplits,
    creatorId: string | null,
    recipientId: string,
  ) {
    // An item whose creator is inactive (or was never recorded) has no row to
    // land on. Dropping it is right: these boards report PER CREATOR, and
    // inventing a bucket for someone not on the board would make the column
    // totals disagree with the rows the reader can actually see.
    if (!creatorId) return;
    const bucket = splits.get(creatorId);
    if (!bucket) return;
    const split = bucket[family];
    split[classify(creatorId, recipientId)] += 1;
    split.total += 1;
  }

  // A goal with no `createdById` is self-authored — the column is populated on
  // every insert path, and the fallback keeps a legacy row from vanishing.
  for (const r of goalRows) credit("goals", r.creatorId ?? r.recipientId, r.recipientId);
  for (const r of taskRows) credit("tasks", r.creatorId, r.recipientId);
  for (const r of commitRows) {
    credit("commitments", r.taskInitiatorId ?? r.goalCreatorId ?? r.recipientId, r.recipientId);
  }

  return { people, reportsOf, splits };
}
