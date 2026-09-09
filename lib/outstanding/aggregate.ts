import { OUTSTANDING_OVERDUE_BUCKETS } from "@/db/enums";
import { overdueBucketFor } from "./buckets";
import type { DerivedInstallment } from "./types";

export interface CollectionAggRow {
  clientName: string; amount: number; paymentMode: string; responsible: string;
}

export function buildDashboard(rows: DerivedInstallment[], collections: CollectionAggRow[]) {
  const open = rows.filter((r) => r.state !== "paid");
  const overdue = open.filter((r) => r.state === "overdue");
  // due_soon is open + not overdue, so it counts within the Not Due total.
  const notDue = open.filter((r) => r.state === "not_due" || r.state === "due_soon");
  const sum = (xs: DerivedInstallment[]) => xs.reduce((s, r) => s + r.balance, 0);

  const buckets = OUTSTANDING_OVERDUE_BUCKETS.map((b) => {
    const inB = overdue.filter((r) => overdueBucketFor(r.daysOverdue) === b.id);
    return { id: b.id, label: b.label, count: inB.length, amount: sum(inB) };
  });

  const byKey = (xs: DerivedInstallment[], key: (r: DerivedInstallment) => string) => {
    const m = new Map<string, { notDue: number; overdue: number; balance: number }>();
    for (const r of xs) {
      const k = key(r) || "—";
      const cur = m.get(k) ?? { notDue: 0, overdue: 0, balance: 0 };
      if (r.state === "overdue") cur.overdue += r.balance;
      if (r.state === "not_due" || r.state === "due_soon") cur.notDue += r.balance;
      cur.balance += r.balance;
      m.set(k, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.balance - a.balance);
  };

  const monthAgg = (xs: DerivedInstallment[]) => {
    const m = new Map<string, { cases: number; value: number }>();
    for (const r of xs) {
      const month = r.dueDate.slice(0, 7);
      const cur = m.get(month) ?? { cases: 0, value: 0 };
      cur.cases += 1; cur.value += r.balance; m.set(month, cur);
    }
    return [...m.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month));
  };

  const pdcRows = open.filter((r) => r.pdcReceived === false);
  const pdcByResp = (() => {
    const m = new Map<string, { entries: number; amount: number }>();
    for (const r of pdcRows) {
      const k = r.responsibleName ?? "—";
      const cur = m.get(k) ?? { entries: 0, amount: 0 };
      cur.entries += 1; cur.amount += r.balance; m.set(k, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount);
  })();

  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);
  const topBy = (key: (c: CollectionAggRow) => string) => {
    const m = new Map<string, number>();
    for (const c of collections) m.set(key(c), (m.get(key(c)) ?? 0) + c.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  };
  const groupSum = (key: (c: CollectionAggRow) => string) => {
    const m = new Map<string, number>();
    for (const c of collections) m.set(key(c), (m.get(key(c)) ?? 0) + c.amount);
    return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  };

  return {
    totals: {
      totalOutstanding: sum(open),
      overdue: sum(overdue),
      notDue: sum(notDue),
      pdcNotReceived: pdcRows.length,
    },
    buckets,
    monthOverdue: monthAgg(overdue),
    monthNotDue: monthAgg(notDue),
    byEmployee: byKey(open, (r) => r.responsibleName ?? "—"),
    byEntity: byKey(open, (r) => r.entityName ?? "—"),
    pdc: { rows: pdcByResp, totalEntries: pdcRows.length, totalAmount: sum(pdcRows) },
    collections: {
      totalCollected,
      topMode: topBy((c) => c.paymentMode),
      topCollector: topBy((c) => c.responsible),
      topClients: groupSum((c) => c.clientName),
      byMode: groupSum((c) => c.paymentMode),
    },
  };
}
