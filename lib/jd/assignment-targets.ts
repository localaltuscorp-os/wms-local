/**
 * WHO IS ASSIGNED, PER DESTINATION — the mapping between the three boxes on
 * screen and the rows in `jd_assignments`.
 *
 * Pure, and tested: this is the one place where "three lists of people" becomes
 * "one row per person with three flags", and getting it wrong either drops
 * somebody from a destination they were assigned to or gives them the same task
 * twice.
 *
 * ── WHY ONE ROW PER PERSON AND NOT ONE PER DESTINATION ───────────────────
 * A person who does the job for both the DCC and the WMS is ONE assignment with
 * two flags. That keeps the partial unique index on (jd_id, employee_id), which
 * is what stops the same person being assigned twice and receiving the task
 * twice — the failure nobody notices until they are chasing a colleague about a
 * duplicate that was never theirs.
 */

/** The three destinations a Job Description can be pushed to. */
export const JD_TARGETS = ["dcc", "wms", "event"] as const;
export type JdTarget = (typeof JD_TARGETS)[number];

/** What the grid, the form and the drawer all call them. */
export const JD_TARGET_LABELS: Record<JdTarget, string> = {
  dcc: "Daily Compliance Checklist (DCC)",
  wms: "Work Management System (WMS)",
  event: "Event Checklist",
};

/** The short form, for chips and column cells. */
export const JD_TARGET_SHORT: Record<JdTarget, string> = {
  dcc: "DCC",
  wms: "WMS",
  event: "Event",
};

/** Employee ids per destination — the shape the three boxes hold. */
export type TargetPeople = Record<JdTarget, string[]>;

export const EMPTY_TARGET_PEOPLE: TargetPeople = { dcc: [], wms: [], event: [] };

/** One `jd_assignments` row, as far as this module is concerned. */
export interface AssignmentRow {
  employeeId: string;
  forDcc: boolean;
  forWms: boolean;
  forEvent: boolean;
}

/**
 * The rows to write for these three lists.
 *
 * DESTINATIONS THAT ARE SWITCHED OFF CONTRIBUTE NOBODY. A JD that does not push
 * to the WMS cannot meaningfully have WMS people, and storing them anyway
 * produces assignments that do nothing until somebody ticks a box months later
 * and is surprised by who receives the work. The form keeps the names on screen
 * so re-ticking restores them; what is SAVED is only what is switched on.
 *
 * A person listed under a destination that is off, and nowhere else, therefore
 * yields no row at all.
 */
export function toAssignmentRows(
  people: TargetPeople,
  enabled: Record<JdTarget, boolean>,
): AssignmentRow[] {
  const byEmployee = new Map<string, AssignmentRow>();

  for (const target of JD_TARGETS) {
    if (!enabled[target]) continue;
    for (const employeeId of people[target]) {
      if (!employeeId) continue;
      const row =
        byEmployee.get(employeeId) ??
        { employeeId, forDcc: false, forWms: false, forEvent: false };
      if (target === "dcc") row.forDcc = true;
      if (target === "wms") row.forWms = true;
      if (target === "event") row.forEvent = true;
      byEmployee.set(employeeId, row);
    }
  }

  // Insertion order, so a re-save of an unchanged form writes the same rows in
  // the same order and the diff in a log is empty rather than noise.
  return [...byEmployee.values()];
}

/** The three lists, read back from stored rows. The inverse of the above. */
export function fromAssignmentRows(rows: readonly AssignmentRow[]): TargetPeople {
  const out: TargetPeople = { dcc: [], wms: [], event: [] };
  for (const r of rows) {
    if (r.forDcc) out.dcc.push(r.employeeId);
    if (r.forWms) out.wms.push(r.employeeId);
    if (r.forEvent) out.event.push(r.employeeId);
  }
  return out;
}

/**
 * Everyone named on this JD, once each, in a stable order.
 *
 * The Bank's "Add To Person" column shows this rather than three lists: the
 * column answers "is this job assigned to anybody by name?", and the detail of
 * which destination each covers belongs in the drawer where there is room to
 * say it.
 */
export function allAssignedIds(people: TargetPeople): string[] {
  const seen = new Set<string>();
  for (const target of JD_TARGETS) {
    for (const id of people[target]) seen.add(id);
  }
  return [...seen];
}

/** Is anybody assigned to any destination? */
export function hasAnyAssignee(people: TargetPeople): boolean {
  return JD_TARGETS.some((t) => people[t].length > 0);
}
