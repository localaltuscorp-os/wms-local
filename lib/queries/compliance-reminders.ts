import "server-only";
import { loadComplianceFills, loadComplianceItems, loadCompliancePeople, type CompliancePerson } from "@/lib/queries/compliance";
import { matchFills, mccOccurrences, wccOccurrences } from "@/lib/compliance/schedule";
import { isFilled } from "@/lib/compliance/rows";
import { doerStatusOf } from "@/lib/compliance/status";
import { completedQuantityOf, quantityTargetOf } from "@/lib/compliance/quantity";
import type { DueCompliance } from "@/lib/compliance/reminders";

/**
 * Every WCC compliance due between two dates and every MCC compliance due in
 * the given months, for every active employee — each with whether its doer has
 * filled it. What both reminder jobs read.
 *
 * "Filled" is lib/compliance/rows' `isFilled`, the same test the screens use,
 * so an email never names somebody the checklist shows as filled.
 */
export async function loadDueCompliances(args: {
  wccFrom: string;
  wccTo: string;
  mccMonths: string[];
}): Promise<{ people: CompliancePerson[]; due: DueCompliance[] }> {
  const people = await loadCompliancePeople();
  const items = await loadComplianceItems(people.map((p) => p.id));
  const occurrences = [
    // Only rows whose DEADLINE is in range: a weekly one still open later in the
    // week is not late yet.
    ...wccOccurrences(items, args.wccFrom, args.wccTo).filter((o) => o.deadline >= args.wccFrom && o.deadline <= args.wccTo),
    ...mccOccurrences(items, args.mccMonths),
  ];
  if (occurrences.length === 0) return { people, due: [] };

  const from = occurrences.reduce((m, o) => (o.periodStart < m ? o.periodStart : m), "9999-12-31");
  const to = occurrences.reduce((m, o) => (o.periodEnd > m ? o.periodEnd : m), "0000-01-01");
  const fills = matchFills(occurrences, await loadComplianceFills([...new Set(occurrences.map((o) => o.itemId))], from, to));
  const byId = new Map(items.map((i) => [i.id, i]));

  return {
    people,
    due: occurrences.map((o) => {
      const item = byId.get(o.itemId);
      const fill = fills.get(o.key);
      const done = doerStatusOf(fill) === "done";
      // The count, the way the table reads it: only a Done row of a compliance that counts has one.
      const quantity = item ? quantityTargetOf(item) : null;
      return {
        ownerId: o.ownerId,
        kind: o.kind,
        title: item?.title ?? "—",
        deadline: o.deadline,
        filled: isFilled(fill),
        done,
        target: quantity?.target ?? null,
        unit: quantity?.unit ?? null,
        completed: quantity && done ? completedQuantityOf(fill) : null,
      };
    }),
  };
}
