import type { StoredInstallment, CollectionInput, DerivedInstallment } from "./types";

function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toISO.split("-").map(Number) as [number, number, number];
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

export function allocatePayments(
  installments: StoredInstallment[],
  collections: CollectionInput[],
  today: string,
): DerivedInstallment[] {
  const poolByClient = new Map<string, number>(); // paise
  for (const c of collections) {
    poolByClient.set(c.clientName, (poolByClient.get(c.clientName) ?? 0) + Math.round(c.amount * 100));
  }
  const byClient = new Map<string, StoredInstallment[]>();
  for (const i of installments) {
    const list = byClient.get(i.clientName);
    if (list) list.push(i);
    else byClient.set(i.clientName, [i]);
  }
  const result: DerivedInstallment[] = [];
  for (const [client, list] of byClient) {
    let pool = poolByClient.get(client) ?? 0;
    const sorted = [...list].sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || (a.periodIndex ?? 0) - (b.periodIndex ?? 0),
    );
    for (const i of sorted) {
      const amt = Math.round(i.amount * 100);
      const paid = Math.min(pool, amt);
      pool -= paid;
      const balance = amt - paid;
      const overdueDays = balance > 0 ? Math.max(0, daysBetween(i.dueDate, today)) : 0;
      let state: DerivedInstallment["state"];
      if (balance <= 0) {
        state = "paid";
      } else if (overdueDays > 0) {
        state = "overdue";
      } else {
        // not overdue and unpaid: due within 7 days → due_soon, else not_due
        const daysUntilDue = daysBetween(today, i.dueDate);
        state = daysUntilDue >= 0 && daysUntilDue <= 7 ? "due_soon" : "not_due";
      }
      result.push({
        ...i,
        paid: paid / 100,
        balance: balance / 100,
        state,
        daysOverdue: state === "overdue" ? overdueDays : 0,
      });
    }
  }
  return result;
}
