import type { Employee, Task } from "@/db/schema";
import type { TopPerformer } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPLETED_STATUSES = new Set(["done", "approved"]);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Leaderboard order, most deserving first, with every tie broken.
 *
 *   1. more completed                        — the headline metric
 *   2. better on-time rate                    — quality over raw volume
 *   3. faster average turnaround              — speed as the third signal
 *   4. name A→Z                               — a stable, arbitrary last resort
 *
 * Steps 2 and 3 treat "unmeasurable" (null) as WORSE than any real figure, so a
 * person with no dated completions never edges out someone with a measured
 * record purely by having nothing to measure. Step 4 exists so the order is
 * fully deterministic: without it two identical rows could swap places between
 * renders and the ranks would flicker.
 */
function compareForRank(a: TopPerformer, b: TopPerformer): number {
  if (b.doneCount !== a.doneCount) return b.doneCount - a.doneCount;

  const rate = (v: number | null) => (v ?? -1);
  if (rate(b.onTimeRate) !== rate(a.onTimeRate)) return rate(b.onTimeRate) - rate(a.onTimeRate);

  // Lower turnaround is better; null sorts last.
  const turn = (v: number | null) => (v ?? Number.POSITIVE_INFINITY);
  if (turn(a.avgTurnaroundDays) !== turn(b.avgTurnaroundDays)) {
    return turn(a.avgTurnaroundDays) - turn(b.avgTurnaroundDays);
  }

  return a.employeeName.localeCompare(b.employeeName);
}

export function computeTopPerformers(
  tasks: Task[],
  employees: Employee[],
  now: Date,
  limit: number,
): TopPerformer[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const counts = new Map<string, number>();
  const sparks = new Map<string, number[]>();
  // Punctuality + turnaround, accumulated in the same pass as the counts.
  // `dated` counts only completions that carry BOTH a completion and a due
  // date; undated work is excluded from the rate rather than scored as late.
  const punctual = new Map<string, { onTime: number; dated: number }>();
  const turnaround = new Map<string, { totalDays: number; n: number }>();

  const today = startOfDay(now);

  for (const t of tasks) {
    if (!COMPLETED_STATUSES.has(t.status)) continue;
    counts.set(t.doerId, (counts.get(t.doerId) ?? 0) + 1);

    if (t.completedAt) {
      if (t.dueAt) {
        const p = punctual.get(t.doerId) ?? { onTime: 0, dated: 0 };
        p.dated++;
        // Whole-day comparison: finishing at 6pm on the due date is on time.
        if (startOfDay(t.completedAt).getTime() <= startOfDay(t.dueAt).getTime()) p.onTime++;
        punctual.set(t.doerId, p);
      }
      const days = Math.max(
        0,
        (t.completedAt.getTime() - t.createdAt.getTime()) / MS_PER_DAY,
      );
      const a = turnaround.get(t.doerId) ?? { totalDays: 0, n: 0 };
      a.totalDays += days;
      a.n++;
      turnaround.set(t.doerId, a);
    }

    const referenceDate = t.completedAt ?? t.createdAt;
    const d = startOfDay(referenceDate);
    const diff = Math.floor(
      (today.getTime() - d.getTime()) / MS_PER_DAY,
    );
    if (diff < 0 || diff >= 7) continue;
    if (!sparks.has(t.doerId)) sparks.set(t.doerId, new Array(7).fill(0));
    const idx = 6 - diff;
    sparks.get(t.doerId)![idx]! += 1;
  }

  const ranked: TopPerformer[] = [...counts.entries()]
    .map(([employeeId, doneCount]) => {
      const emp = employeeById.get(employeeId);
      if (!emp) return null;
      const p = punctual.get(employeeId);
      const a = turnaround.get(employeeId);
      return {
        employeeId,
        employeeName: emp.name,
        doneCount,
        weeklySparkline: sparks.get(employeeId) ?? new Array(7).fill(0),
        rank: 0, // assigned below
        department: emp.department ?? null,
        completedOnTime: p?.onTime ?? 0,
        datedCompletions: p?.dated ?? 0,
        // Guarded on the DENOMINATOR, not on doneCount: someone with nine
        // completions that carry no due date has nothing to measure, and
        // reporting them at 0% would read as "never on time".
        onTimeRate: p && p.dated > 0 ? Math.round((p.onTime / p.dated) * 100) : null,
        avgTurnaroundDays:
          a && a.n > 0 ? Math.round((a.totalDays / a.n) * 10) / 10 : null,
      } satisfies TopPerformer;
    })
    .filter((x): x is TopPerformer => x !== null)
    .sort(compareForRank);

  // DENSE, SEQUENTIAL ranking: 1, 2, 3, 4, 5 … with no shared numbers and no
  // gaps. The old competition ranking gave ties the same number and then
  // SKIPPED (5, 5, 7), so a leaderboard of six people could show #4, #4, #6 and
  // no #5 at all. `compareForRank` breaks every tie deterministically, so the
  // position is always unique and the sequence is always complete.
  for (let i = 0; i < ranked.length; i++) ranked[i]!.rank = i + 1;

  return ranked.slice(0, limit);
}

/**
 * The leaderboard entries for a specific set of people, carrying their
 * GLOBAL rank. Used when the dashboard is filtered by employee/department —
 * a person filtered alone must still read "7th of the team", never "1st of
 * the selection". People with zero completions rank below everyone scored.
 */
export function pickPerformersForEmployees(
  globalRanking: TopPerformer[],
  employeeIds: string[],
  employees: Employee[],
  limit: number,
): TopPerformer[] {
  const byId = new Map(globalRanking.map((p) => [p.employeeId, p]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const unrankedRank = globalRanking.length + 1;

  return employeeIds
    .map((id) => {
      const hit = byId.get(id);
      if (hit) return hit;
      const emp = employeeById.get(id);
      if (!emp) return null;
      return {
        employeeId: id,
        employeeName: emp.name,
        doneCount: 0,
        weeklySparkline: new Array(7).fill(0),
        rank: unrankedRank,
        department: emp.department ?? null,
        // Nothing completed ⇒ nothing measurable. Null, never 0%.
        completedOnTime: 0,
        datedCompletions: 0,
        onTimeRate: null,
        avgTurnaroundDays: null,
      } satisfies TopPerformer;
    })
    .filter((x): x is TopPerformer => x !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}
