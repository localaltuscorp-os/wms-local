import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, employees, tasks, weeklyGoals, dailyChecklist, holidays } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { istYmd } from "@/lib/weekly-goals/week";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/**
 * MANAGER ACTIVITY BOARD — one row per manager across the three activity
 * families the business actually tracks (weekly goals, WMS tasks, daily
 * commitments), each row expanding to a per-member breakdown.
 *
 * ── WHERE THE DELEGATE / COUNTERPART SPLIT COMES FROM ────────────────────
 * Every item has an ORIGINATOR — the person who put the work on someone's
 * plate. It is a different column per family, which is why this lives in one
 * place instead of three:
 *
 *   tasks        → `tasks.initiatorId`. Explicit; this is what the existing
 *                  initiator scorecard already classifies.
 *   weekly goals → `weeklyGoals.createdById`. Populated on EVERY insert path
 *                  (self-authored goals carry the author, cascaded goals carry
 *                  the cascading manager — see lib/goals/cascade.ts), so a goal
 *                  written for you by your manager is distinguishable from one
 *                  you wrote yourself without any schema change.
 *   commitments  → NOT stored, but derivable. A My Day row links back to the
 *                  work it came from: `taskId` → that task's initiator,
 *                  `goalId` → that goal's creator. A `standalone` row has
 *                  neither, and that is not missing data — a standalone
 *                  commitment IS self-authored by definition.
 *
 * Given an originator, the split against manager M is:
 *
 *   DELEGATE (A)    — originator IS M. M put this on the member's plate.
 *                     On the Self row this is M's own self-authored work.
 *   COUNTERPART (B) — originator is anyone else: the member themselves, a peer,
 *                     or someone outside M's line.
 *
 * A and B PARTITION the member's items — every row lands in exactly one — so
 * `G.T. = A + B` is a true total rather than a sum of two overlapping cuts.
 * That property is what lets the manager row be a plain sum of its members.
 */

// The shared shape lives in a module with NO `server-only` and no DB import,
// and is re-exported here so every existing server-side importer is unchanged.
// `ACTIVITY_TARGETS` in particular has to be reachable from the client table,
// and a value import from THIS file would drag Drizzle into the browser bundle
// and trip server-only at build time. See the note in the contract module.
export {
  ACTIVITY_TARGETS,
  type ActivitySplit,
  type MemberActivityRow,
  type ManagerActivityRow,
  type ManagerActivityBoard,
  ACTIVITY_PERIODS,
  DEFAULT_ACTIVITY_PERIOD,
  type ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";

import type {
  ActivitySplit,
  MemberActivityRow,
  ManagerActivityRow,
  ManagerActivityBoard,
} from "@/lib/dashboard/manager-activity-contract";
// The created-side five-way split, shared with the flat workload board so the
// two sections on the same screen cannot disagree about a number.
import { loadCreatorSplits, emptyFamilySplits } from "./creator-splits";
import {
  activityWindow,
  daysBefore,
  calendarDaysBetween,
  computeActivityTargets,
  type ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";
import { countWorkingDays } from "@/lib/transforms/working-days";

const emptySplit = (): ActivitySplit => ({ delegate: 0, counterpart: 0, total: 0 });

/** Add one item to a member's split, attributed against `managerId`. */
function credit(split: ActivitySplit, originatorId: string | null, managerId: string) {
  if (originatorId && originatorId === managerId) split.delegate += 1;
  else split.counterpart += 1;
  split.total += 1;
}

export async function managerActivityBoard(
  period: ActivityPeriod,
  now: Date = new Date(),
  custom?: { from: string; to: string } | null,
): Promise<ManagerActivityBoard> {
  // The window is computed from today's date, not subtracted from it: "This
  // Month" and "This Year" are calendar-anchored and have no day count. A
  // custom range is the one case that supplies its own bounds.
  const { from, to } = activityWindow(period, istYmd(now), custom);

  // Working days need the holiday calendar, so the targets are computed here
  // rather than in the contract (which stays I/O-free for the client bundle).
  const holidayRows = await db
    .select({ holidayDate: holidays.holidayDate })
    .from(holidays)
    .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to)))
    .catch(() => [] as { holidayDate: string }[]);
  const targets = computeActivityTargets(
    calendarDaysBetween(from, to),
    countWorkingDays(
      new Date(`${from}T00:00:00Z`),
      new Date(`${to}T00:00:00Z`),
      new Set(holidayRows.map((h) => h.holidayDate)),
    ),
  );

  const people = await withRetry(
    () =>
      db
        .select({
          id: employees.id,
          name: employees.name,
          managerId: employees.managerId,
        })
        .from(employees)
        .where(eq(employees.isActive, true)),
    RETRY,
  );

  // manager -> direct reports. A "manager" here is anyone with at least one
  // active direct report; the board has nothing to say about individual
  // contributors.
  const reportsOf = new Map<string, { id: string; name: string }[]>();
  for (const p of people) {
    if (!p.managerId) continue;
    const list = reportsOf.get(p.managerId) ?? [];
    list.push({ id: p.id, name: p.name });
    reportsOf.set(p.managerId, list);
  }
  const managers = people
    .filter((p) => (reportsOf.get(p.id)?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (managers.length === 0) {
    return { period, from, to, targets, rows: [] };
  }

  // Everyone who can appear on the board: every manager plus every direct
  // report of a manager. Scoping the three queries to this set keeps them off
  // the rest of the org.
  const scope = new Set<string>();
  for (const m of managers) {
    scope.add(m.id);
    for (const r of reportsOf.get(m.id) ?? []) scope.add(r.id);
  }
  const scopeIds = [...scope];

  const [goalRows, taskRows, commitRows] = await Promise.all([
    // Weekly goals whose week OVERLAPS the window. `weekStart` is the Monday,
    // so a week is live for the six days after it — comparing weekStart to the
    // window directly would miss a week that began before the window opened.
    withRetry(
      () =>
        db
          .select({
            employeeId: weeklyGoals.employeeId,
            originatorId: weeklyGoals.createdById,
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
          .select({
            employeeId: tasks.doerId,
            originatorId: tasks.initiatorId,
          })
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
    // Commitments carry no originator column, so it is resolved through the
    // row's own links: the task's initiator, else the goal's creator, else the
    // owner (a standalone My Day row is self-authored by definition).
    withRetry(
      () =>
        db
          .select({
            employeeId: dailyChecklist.employeeId,
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

  // Bucket by employee once, then read each bucket per manager. A member can
  // only report to one manager, but the manager also appears as their OWN Self
  // row, so the same rows are read from two places.
  const byEmployee = new Map<
    string,
    { goals: (string | null)[]; tasks: (string | null)[]; commitments: (string | null)[] }
  >();
  const bucket = (id: string) => {
    let b = byEmployee.get(id);
    if (!b) {
      b = { goals: [], tasks: [], commitments: [] };
      byEmployee.set(id, b);
    }
    return b;
  };
  for (const r of goalRows) bucket(r.employeeId).goals.push(r.originatorId ?? r.employeeId);
  for (const r of taskRows) bucket(r.employeeId).tasks.push(r.originatorId);
  for (const r of commitRows) {
    bucket(r.employeeId).commitments.push(
      r.taskInitiatorId ?? r.goalCreatorId ?? r.employeeId,
    );
  }

  // The created side, for every active person in one pass. Shared loader, so
  // the founder rule, the downline walk and the commitment-originator fallback
  // exist once for both boards.
  const { splits: createdBy } = await loadCreatorSplits(from, to);
  const createdOf = (id: string) => createdBy.get(id) ?? emptyFamilySplits();
  const createdSum = (c: ReturnType<typeof createdOf>) =>
    c.goals.total + c.tasks.total + c.commitments.total;

  const rows: ManagerActivityRow[] = managers.map((m) => {
    const reports = (reportsOf.get(m.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const roster = [{ id: m.id, name: m.name, isSelf: true }, ...reports.map((r) => ({ ...r, isSelf: false }))];

    const members: MemberActivityRow[] = roster.map((p) => {
      const b = byEmployee.get(p.id);
      const goals = emptySplit();
      const tasksSplit = emptySplit();
      const commitments = emptySplit();
      for (const o of b?.goals ?? []) credit(goals, o, m.id);
      for (const o of b?.tasks ?? []) credit(tasksSplit, o, m.id);
      for (const o of b?.commitments ?? []) credit(commitments, o, m.id);
      const created = createdOf(p.id);
      return {
        employeeId: p.id,
        employeeName: p.name,
        isSelf: p.isSelf,
        goals,
        tasks: tasksSplit,
        commitments,
        grandTotal: goals.total + tasksSplit.total + commitments.total,
        created,
        createdTotal: createdSum(created),
        directReports: reportsOf.get(p.id)?.length ?? 0,
      };
    });

    const sum = (pick: (x: MemberActivityRow) => number) =>
      members.reduce((s, x) => s + pick(x), 0);
    const goals = sum((x) => x.goals.total);
    const tasksTotal = sum((x) => x.tasks.total);
    const commitments = sum((x) => x.commitments.total);

    const created = createdOf(m.id);
    return {
      managerId: m.id,
      managerName: m.name,
      directReports: reports.length,
      goals,
      tasks: tasksTotal,
      commitments,
      total: goals + tasksTotal + commitments,
      created,
      createdTotal: createdSum(created),
      members,
    };
  });

  return { period, from, to, targets, rows };
}
