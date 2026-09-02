import type { Employee, Task } from "@/db/schema";
import type { TopPerformer } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPLETED_STATUSES = new Set(["done", "approved"]);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
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

  const today = startOfDay(now);

  for (const t of tasks) {
    if (!COMPLETED_STATUSES.has(t.status)) continue;
    counts.set(t.doerId, (counts.get(t.doerId) ?? 0) + 1);

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
      return {
        employeeId,
        employeeName: emp.name,
        doneCount,
        weeklySparkline: sparks.get(employeeId) ?? new Array(7).fill(0),
        rank: 0, // assigned below
      } satisfies TopPerformer;
    })
    .filter((x): x is TopPerformer => x !== null)
    .sort((a, b) => b.doneCount - a.doneCount);

  // Competition ranking — ties share the better rank (5, 5, 7 …).
  for (let i = 0; i < ranked.length; i++) {
    const prev = ranked[i - 1];
    ranked[i]!.rank =
      prev && prev.doneCount === ranked[i]!.doneCount ? prev.rank : i + 1;
  }

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
      } satisfies TopPerformer;
    })
    .filter((x): x is TopPerformer => x !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}
