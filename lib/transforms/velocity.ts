import type { Task } from "@/db/schema";
import type { VelocityPoint } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPLETED_STATUSES = new Set(["done", "approved"]);

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function computeVelocity(
  tasks: Task[],
  start: Date,
  endExclusive: Date,
): VelocityPoint[] {
  const startMs = startOfDay(start).getTime();
  const endMs = startOfDay(endExclusive).getTime();
  const days = Math.max(0, Math.floor((endMs - startMs) / MS_PER_DAY));

  const points: VelocityPoint[] = Array.from({ length: days }).map(
    (_, i) => {
      const d = new Date(startMs + i * MS_PER_DAY);
      return { date: isoDay(d), created: 0, completed: 0 };
    },
  );

  const indexFor = (d: Date): number => {
    const dayMs = startOfDay(d).getTime();
    const idx = Math.floor((dayMs - startMs) / MS_PER_DAY);
    if (idx < 0 || idx >= days) return -1;
    return idx;
  };

  for (const t of tasks) {
    const ci = indexFor(t.createdAt);
    if (ci >= 0) points[ci]!.created += 1;

    if (t.completedAt && COMPLETED_STATUSES.has(t.status)) {
      const cmpi = indexFor(t.completedAt);
      if (cmpi >= 0) points[cmpi]!.completed += 1;
    }
  }

  return points;
}
