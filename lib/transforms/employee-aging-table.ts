import type { Employee, Task } from "@/db/schema";
import type { AgingRow } from "@/lib/types";
import { AGE_BUCKETS, PENDING_STATUSES, type AgeBucketId } from "@/db/enums";
import { bucketForAge } from "./aging-buckets";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Source from the canonical PENDING_STATUSES so adding new pending values
// in db/enums.ts automatically flows into the aging heatmap.
const PENDING = new Set<string>(PENDING_STATUSES);

function ageInDays(createdAt: Date, now: Date): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY);
}

function emptyBuckets(): Record<AgeBucketId, number> {
  return Object.fromEntries(
    AGE_BUCKETS.map((b) => [b.id, 0]),
  ) as Record<AgeBucketId, number>;
}

export function computeEmployeeAgingTable(
  tasks: Task[],
  employees: Employee[],
  now: Date,
): AgingRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const rows = new Map<string, AgingRow>();

  for (const t of tasks) {
    if (!PENDING.has(t.status)) continue;
    const emp = employeeById.get(t.doerId);
    if (!emp) continue;

    if (!rows.has(t.doerId)) {
      rows.set(t.doerId, {
        employeeId: t.doerId,
        employeeName: emp.name,
        buckets: emptyBuckets(),
        total: 0,
      });
    }

    const row = rows.get(t.doerId)!;
    const days = ageInDays(t.createdAt, now);
    const b = bucketForAge(days);
    row.buckets[b] += 1;
    row.total += 1;
  }

  return [...rows.values()].sort((a, b) => b.total - a.total);
}
