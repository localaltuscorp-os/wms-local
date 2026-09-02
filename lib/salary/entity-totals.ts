// WS-5 Salary core — entity-wise total Salary Payable AFTER Professional Tax
// (PURE: no DB). Spec: "Entity-wise total Salary Payable after deducting PT."
//
// Groups per-person payable rows by paying entity and folds the after-PT total,
// plus the pieces (gross payable, PT, retention bonus, amount paid) so the
// entity summary can show the full column set with "extreme filters".

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface EntityPayableRow {
  employeeId: string;
  employeeName: string;
  payingEntityId: string | null;
  payingEntityName: string | null;
  /** Salary payable before PT (proration gross, or CTC monthly payable). */
  payableBeforePt: number;
  pt: number;
  /** Retention bonus counted this month (0 unless paid/effective). */
  retentionBonus?: number;
  /** Final amount actually paid after accountant adjustments (optional). */
  amountPaid?: number;
}

export interface EntityTotal {
  payingEntityId: string | null;
  payingEntityName: string;
  headcount: number;
  payableBeforePt: number;
  pt: number;
  retentionBonus: number;
  /** payableBeforePt − pt + retentionBonus. The headline "Salary Payable after PT". */
  payableAfterPt: number;
  amountPaid: number;
  rows: EntityPayableRow[];
}

const UNASSIGNED = "— No entity —";

/**
 * Group payable rows by paying entity and total Salary Payable AFTER PT.
 * Retention bonus is added before the after-PT figure (spec: retention added
 * BEFORE Salary Payable). Sorted by after-PT total, biggest first. Pure.
 */
export function entityTotals(rows: EntityPayableRow[]): EntityTotal[] {
  const byEntity = new Map<string, EntityTotal>();

  for (const r of rows) {
    const key = r.payingEntityId ?? "__none__";
    let bucket = byEntity.get(key);
    if (!bucket) {
      bucket = {
        payingEntityId: r.payingEntityId,
        payingEntityName: r.payingEntityName || UNASSIGNED,
        headcount: 0,
        payableBeforePt: 0,
        pt: 0,
        retentionBonus: 0,
        payableAfterPt: 0,
        amountPaid: 0,
        rows: [],
      };
      byEntity.set(key, bucket);
    }
    const rb = r.retentionBonus ?? 0;
    bucket.headcount += 1;
    bucket.payableBeforePt = round2(bucket.payableBeforePt + r.payableBeforePt);
    bucket.pt = round2(bucket.pt + r.pt);
    bucket.retentionBonus = round2(bucket.retentionBonus + rb);
    bucket.amountPaid = round2(bucket.amountPaid + (r.amountPaid ?? 0));
    bucket.rows.push(r);
  }

  const out = [...byEntity.values()];
  for (const b of out) {
    b.payableAfterPt = round2(b.payableBeforePt - b.pt + b.retentionBonus);
  }
  out.sort((a, b) => b.payableAfterPt - a.payableAfterPt);
  return out;
}

/** Grand total across all entities (after PT). */
export function grandTotalAfterPt(totals: EntityTotal[]): number {
  return round2(totals.reduce((s, t) => s + t.payableAfterPt, 0));
}
