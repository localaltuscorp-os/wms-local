import type {
  DoneOnTime,
  PunctualityBasis,
  PunctualityDepartment,
  PunctualityPerson,
} from "@/lib/types";
import { DONE_AGING_BANDS, bucketSignedDays } from "./aging-bands";

/** Minimal shape of the dashboard's employee→departments membership map. */
export type DeptRef = { id: string; name: string; isPrimary: boolean };
export type DeptByEmployee = Map<string, DeptRef[]>;

/** The department a doer is counted under — their primary, else the first
 *  membership, else nothing (they're then left out of the rollup entirely
 *  rather than lumped into a fake "Unassigned" bucket). */
function primaryDept(refs: DeptRef[] | undefined): DeptRef | null {
  if (!refs || refs.length === 0) return null;
  return refs.find((d) => d.isPrimary) ?? refs[0] ?? null;
}

export interface DoneOnTimeTask {
  status: string;
  archived: boolean;
  completedAt: Date | string | null;
  dueAt: Date | string | null;          // effective (revised ?? original)
  originalDueAt: Date | string | null;  // raw due_at
  doerId: string;
}

function utcDayKey(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}
function dayNumber(d: Date | string): number {
  return Math.floor(new Date(`${utcDayKey(d)}T00:00:00Z`).getTime() / 86_400_000);
}

/**
 * The spread starts at ONE day, not two.
 *
 * It used to return null for a single day late, so a task that slipped by a
 * day was counted in `late` and then landed in no bracket — the four columns
 * summed to less than the Late total beside them, and the table carried a
 * residual row in its tooltip to explain the gap. The bracket is 1-3 now, so
 * the four columns partition every late task and the residual cannot exist.
 */
function lateBucket(daysLate: number): keyof PunctualityPerson["lateSpread"] | null {
  if (daysLate <= 0) return null;       // not late at all
  if (daysLate <= 3) return "d1_3";
  if (daysLate <= 7) return "d4_7";
  if (daysLate <= 14) return "d8_14";
  return "d15";
}

function basisFor(
  done: DoneOnTimeTask[],
  pick: (t: DoneOnTimeTask) => Date | string | null,
  basis: "original" | "revised",
  nameById: Map<string, string>,
  deptByEmployee?: DeptByEmployee,
): PunctualityBasis {
  let onTime = 0, late = 0, undated = 0;
  const per = new Map<
    string,
    {
      onTime: number;
      late: number;
      spread: PunctualityPerson["lateSpread"];
      /** Days-late summed across this person's late tasks; divided at the end.
       *  Kept as a running total rather than an array — the mean is the only
       *  thing anyone reads and a list of every delay would be a per-person
       *  allocation on a hot path. */
      lateDaysTotal: number;
      dept: string | null;
    }
  >();
  const hist = new Map(DONE_AGING_BANDS.map((b) => [b.id, 0]));
  // departmentId → running tally, filled only when a membership map is given.
  const perDept = new Map<string, { name: string; onTime: number; late: number }>();

  for (const t of done) {
    const due = pick(t);
    if (!t.completedAt || !due) { undated++; continue; }
    const signed = dayNumber(due) - dayNumber(t.completedAt); // + early, - late
    const isOnTime = signed >= 0;
    if (isOnTime) onTime++; else late++;
    hist.set(bucketSignedDays(signed), (hist.get(bucketSignedDays(signed)) ?? 0) + 1);
    const p = per.get(t.doerId) ?? { onTime: 0, late: 0, spread: { d1_3: 0, d4_7: 0, d8_14: 0, d15: 0 }, lateDaysTotal: 0, dept: null };
    if (isOnTime) {
      p.onTime++;
    } else {
      p.late++;
      p.lateDaysTotal += -signed; // -signed = days late
      const b = lateBucket(-signed);
      if (b) p.spread[b]++;
    }
    per.set(t.doerId, p);

    const dept = deptByEmployee ? primaryDept(deptByEmployee.get(t.doerId)) : null;
    if (dept && !p.dept) p.dept = dept.name;
    if (dept) {
      const d = perDept.get(dept.id) ?? { name: dept.name, onTime: 0, late: 0 };
      if (isOnTime) d.onTime++; else d.late++;
      perDept.set(dept.id, d);
    }
  }

  const dated = onTime + late;
  const byPerson: PunctualityPerson[] = [...per.entries()]
    .map(([employeeId, v]) => {
      const personDone = v.onTime + v.late;
      return {
        employeeId,
        employeeName: nameById.get(employeeId) ?? "Unknown",
        done: personDone, onTime: v.onTime, late: v.late,
        rate: personDone > 0 ? Math.round((v.onTime / personDone) * 100) : 0,
        lateSpread: v.spread,
        // One decimal: "+4.8 days" carries useful precision, "+4.83" does not,
        // and a bare "5" hides the difference between 4.5 and 5.4. Null rather
        // than 0 when nothing is late — zero would read as "always on the day".
        avgDaysLate: v.late > 0 ? Math.round((v.lateDaysTotal / v.late) * 10) / 10 : null,
        department: v.dept,
      };
    })
    .sort((a, b) => b.done - a.done || a.rate - b.rate);

  // Busiest department first, then worst rate — same ordering rule as byPerson,
  // so the row most worth acting on is nearest the top.
  const byDepartment: PunctualityDepartment[] = [...perDept.entries()]
    .map(([departmentId, v]) => {
      const deptDone = v.onTime + v.late;
      return {
        departmentId,
        departmentName: v.name,
        done: deptDone, onTime: v.onTime, late: v.late,
        rate: deptDone > 0 ? Math.round((v.onTime / deptDone) * 100) : 0,
      };
    })
    .sort((a, b) => b.done - a.done || a.rate - b.rate);

  return {
    basis,
    total: done.length, dated, onTime, late, undated,
    onTimeRate: dated > 0 ? Math.round((onTime / dated) * 100) : 0,
    byPerson,
    histogram: DONE_AGING_BANDS.map((b) => ({ id: b.id, label: b.label, count: hist.get(b.id) ?? 0 })),
    byDepartment,
  };
}

export function computeDoneOnTime(
  tasks: DoneOnTimeTask[],
  nameById: Map<string, string>,
  /** employeeId → departments. Omit and `byDepartment` comes back empty. */
  deptByEmployee?: DeptByEmployee,
): DoneOnTime {
  const done = tasks.filter((t) => t.status === "done" && !t.archived);
  return {
    original: basisFor(done, (t) => t.originalDueAt, "original", nameById, deptByEmployee),
    revised: basisFor(done, (t) => t.dueAt, "revised", nameById, deptByEmployee),
  };
}
