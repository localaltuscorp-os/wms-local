import type { Task } from "@/db/schema";
import type { AgingByDate } from "@/lib/types";
import {
  AGE_BUCKETS,
  PENDING_STATUSES as CANONICAL_PENDING_STATUSES,
  type AgeBucketId,
} from "@/db/enums";

// Sourced from the canonical PENDING_STATUSES export so Tier-3 statuses
// (need_info / follow_up_1/2/3) automatically count toward aging.
const PENDING_STATUSES = new Set<string>(CANONICAL_PENDING_STATUSES);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function bucketForAge(days: number): AgeBucketId {
  for (const b of AGE_BUCKETS) {
    if (days >= b.min && days <= b.max) return b.id;
  }
  return "60+";
}

function ageInDays(createdAt: Date, now: Date): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY);
}

export function computeAgingByDate(
  tasks: Task[],
  now: Date,
): AgingByDate[] {
  const counts = new Map<AgeBucketId, number>(
    AGE_BUCKETS.map((b) => [b.id, 0]),
  );

  for (const t of tasks) {
    if (!PENDING_STATUSES.has(t.status)) continue;
    const days = ageInDays(t.createdAt, now);
    const bucket = bucketForAge(days);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return AGE_BUCKETS.map((b) => ({
    bucket: b.id,
    count: counts.get(b.id) ?? 0,
  }));
}
