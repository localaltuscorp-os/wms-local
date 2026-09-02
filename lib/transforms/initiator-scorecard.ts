import type { InitiatorScorecard, InitiatorReportRow } from "@/lib/types";

export interface InitiatorEmployee { id: string; name: string; managerId: string | null; email: string | null }
export interface InitiatedTask { initiatorId: string; doerId: string }

/**
 * Delegation target: tasks a manager is expected to hand to EACH direct report
 * per working day. Raised 3 → 5 (2026-08).
 *
 *   target = PER_REPORT_PER_DAY × workingDays × directReports
 *
 * Exported so the UI can render "Target = 5 × N working days × direct reports"
 * from the same constant the arithmetic uses — a hard-coded 5 in a subtitle is
 * a caption that silently lies the next time this number moves.
 */
export const PER_REPORT_PER_DAY = 5;

/**
 * Every id BELOW `rootId` in the org tree, excluding the root itself.
 * Iterative breadth-first with a `seen` guard so a cyclic manager_id (A manages
 * B manages A — possible, since nothing in the schema forbids it) terminates
 * instead of hanging the request.
 */
function descendantsOf(rootId: string, childrenOf: Map<string, InitiatorEmployee[]>): Set<string> {
  const out = new Set<string>();
  const queue = [...(childrenOf.get(rootId) ?? [])];
  while (queue.length) {
    const node = queue.shift()!;
    if (out.has(node.id) || node.id === rootId) continue;
    out.add(node.id);
    queue.push(...(childrenOf.get(node.id) ?? []));
  }
  return out;
}

/** The five mutually-exclusive channels a manager's initiated task can fall in. */
export type DelegationChannel = "self" | "direct" | "downline" | "founder" | "counterpart";

export const DELEGATION_CHANNEL_LABELS: Record<DelegationChannel, string> = {
  self: "Self",
  direct: "Direct",
  downline: "Downline",
  founder: "Founder",
  counterpart: "Counterpart",
};

/**
 * Build a classifier for ONE manager: doerId → delegation channel.
 *
 * Extracted so the scorecard table and the drill-down drawer classify with the
 * SAME rules and the same precedence. A second copy of this ladder is how the
 * drawer's "Direct" list ends up disagreeing with the Direct column that opened
 * it.
 */
export function buildDelegationClassifier(
  managerId: string,
  employees: InitiatorEmployee[],
  isFounder: (email: string | null) => boolean,
): (doerId: string) => DelegationChannel {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const childrenOf = new Map<string, InitiatorEmployee[]>();
  for (const e of employees) {
    if (!e.managerId) continue;
    const list = childrenOf.get(e.managerId) ?? [];
    list.push(e);
    childrenOf.set(e.managerId, list);
  }
  const reportIds = new Set((childrenOf.get(managerId) ?? []).map((r) => r.id));
  const downlineIds = new Set(
    [...descendantsOf(managerId, childrenOf)].filter((id) => !reportIds.has(id)),
  );

  // Same precedence as computeInitiatorScorecard: self → direct → downline →
  // founder → counterpart.
  return (doerId: string): DelegationChannel => {
    if (doerId === managerId) return "self";
    if (reportIds.has(doerId)) return "direct";
    if (downlineIds.has(doerId)) return "downline";
    if (isFounder(byId.get(doerId)?.email ?? null)) return "founder";
    return "counterpart";
  };
}

export function computeInitiatorScorecard(
  tasks: InitiatedTask[],
  employees: InitiatorEmployee[],
  workingDays: number,
  isFounder: (email: string | null) => boolean,
): InitiatorScorecard[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  // Direct reports per manager id.
  const reportsOf = new Map<string, InitiatorEmployee[]>();
  for (const e of employees) {
    if (e.managerId) {
      const list = reportsOf.get(e.managerId) ?? [];
      list.push(e);
      reportsOf.set(e.managerId, list);
    }
  }
  // Managers = anyone with ≥1 direct report.
  const managerIds = [...reportsOf.keys()];

  return managerIds
    .map((managerId): InitiatorScorecard => {
      const manager = byId.get(managerId);
      const reports = reportsOf.get(managerId) ?? [];
      const reportIds = new Set(reports.map((r) => r.id));
      // Everyone under this manager at ANY depth, minus the direct reports —
      // that remainder is the "downline" channel.
      const allBelow = descendantsOf(managerId, reportsOf);
      const downlineIds = new Set([...allBelow].filter((id) => !reportIds.has(id)));
      const mine = tasks.filter((t) => t.initiatorId === managerId);

      let toDirectReports = 0, toDownline = 0, toCounterparts = 0, toFounderMgmt = 0, toSelf = 0;
      const givenByReport = new Map<string, number>();
      // Tasks the manager gave to someone in a given direct report's OWN subtree
      // — i.e. work routed past that report rather than through them.
      const downlineByReport = new Map<string, number>();
      // Which direct report each downline person sits under, so a downline task
      // can be attributed to exactly one branch.
      const branchOf = new Map<string, string>();
      for (const r of reports) {
        for (const id of descendantsOf(r.id, reportsOf)) branchOf.set(id, r.id);
      }

      for (const t of mine) {
        // Order matters. Self first (a manager can be their own doer and would
        // otherwise fall through to "counterpart"), then the hierarchy, then
        // founder, then everyone else. Founder is checked AFTER the hierarchy
        // because a founder who genuinely reports into this manager is a direct
        // report first and a founder second.
        if (t.doerId === managerId) {
          toSelf++;
        } else if (reportIds.has(t.doerId)) {
          toDirectReports++;
          givenByReport.set(t.doerId, (givenByReport.get(t.doerId) ?? 0) + 1);
        } else if (downlineIds.has(t.doerId)) {
          toDownline++;
          const branch = branchOf.get(t.doerId);
          if (branch) downlineByReport.set(branch, (downlineByReport.get(branch) ?? 0) + 1);
        } else if (isFounder(byId.get(t.doerId)?.email ?? null)) {
          toFounderMgmt++;
        } else {
          toCounterparts++;
        }
      }

      const goal = PER_REPORT_PER_DAY * workingDays;
      const target = reports.length * goal;
      const perReport: InitiatorReportRow[] = reports
        .map((r) => {
          const given = givenByReport.get(r.id) ?? 0;
          return {
            employeeId: r.id,
            employeeName: r.name,
            given,
            goal,
            hit: given >= goal,
            // Hierarchy context for the expanded breakdown: how many people this
            // report manages, and how much work went AROUND them into that team.
            reportCount: (reportsOf.get(r.id) ?? []).length,
            downlineGiven: downlineByReport.get(r.id) ?? 0,
          };
        })
        .sort((a, b) => a.given - b.given || a.employeeName.localeCompare(b.employeeName));

      return {
        managerId,
        managerName: manager?.name ?? "Unknown",
        directReports: reports.length,
        totalInitiated: mine.length,
        toDirectReports, toDownline, toCounterparts, toFounderMgmt, toSelf,
        target, actual: toDirectReports,
        attainmentPct: target > 0 ? Math.round((toDirectReports / target) * 100) : 0,
        workingDays,
        perReportPerDay: PER_REPORT_PER_DAY,
        perReport,
      };
    })
    // Worst attainment first — surfaces managers not delegating.
    .sort((a, b) => a.attainmentPct - b.attainmentPct || b.directReports - a.directReports);
}
