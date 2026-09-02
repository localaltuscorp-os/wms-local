import type { NotApprovedAging, NotApprovedPerson } from "@/lib/types";
import { WAITING_AGING_BANDS, bucketWaitingDays } from "./aging-bands";

export interface NotApprovedInput {
  id: string;
  title: string;
  doerId: string;
  /** When it entered not_approved (event time, else completed_at, else created_at). */
  sentBackAt: Date | string | null;
}

const MS_PER_DAY = 86_400_000;
function dayNumber(d: Date | string): number {
  const key = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return Math.floor(new Date(`${key}T00:00:00Z`).getTime() / MS_PER_DAY);
}

export function computeNotApprovedAging(
  rows: NotApprovedInput[],
  nameById: Map<string, string>,
  now: Date,
  /** employeeId → department, for the roster's role tag. Optional so existing
   *  callers (and the tests) keep working without it. */
  departmentById?: Map<string, string | null>,
): NotApprovedAging {
  const nowDay = dayNumber(now);
  const bands = new Map(WAITING_AGING_BANDS.map((b) => [b.id, 0]));
  const per = new Map<string, NotApprovedPerson>();

  for (const r of rows) {
    const waitingDays = r.sentBackAt ? Math.max(0, nowDay - dayNumber(r.sentBackAt)) : 0;
    const band = bucketWaitingDays(waitingDays);
    bands.set(band, (bands.get(band) ?? 0) + 1);
    const p = per.get(r.doerId) ?? {
      employeeId: r.doerId,
      employeeName: nameById.get(r.doerId) ?? "Unknown",
      department: departmentById?.get(r.doerId) ?? null,
      count: 0,
      tasks: [],
    };
    p.count++;
    p.tasks.push({ id: r.id, title: r.title, waitingDays });
    per.set(r.doerId, p);
  }

  const byPerson = [...per.values()]
    .map((p) => ({ ...p, tasks: p.tasks.sort((a, b) => b.waitingDays - a.waitingDays) }))
    // person with the single oldest task first; tie-break by count
    .sort((a, b) => (b.tasks[0]?.waitingDays ?? 0) - (a.tasks[0]?.waitingDays ?? 0) || b.count - a.count);

  return {
    total: rows.length,
    byPerson,
    bands: WAITING_AGING_BANDS.map((b) => ({ id: b.id, label: b.label, count: bands.get(b.id) ?? 0 })),
  };
}
