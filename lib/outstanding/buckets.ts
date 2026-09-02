import { OUTSTANDING_OVERDUE_BUCKETS, type OverdueBucketId } from "@/db/enums";

export function overdueBucketFor(days: number): OverdueBucketId {
  for (const b of OUTSTANDING_OVERDUE_BUCKETS) {
    if (days >= b.min && days <= b.max) return b.id;
  }
  return "60+";
}
