import type { Employee, Task } from "@/db/schema";
import type {
  EmployeeStatusRow,
  StatusCellBucket,
  StatusCellTask,
  ViewMode,
} from "@/lib/types";

/** How many tasks a hover preview shows. */
const PREVIEW_MAX = 6;

/**
 * Optional membership map: employeeId → the departments they belong to.
 * When omitted, we fall back to the single primary department on the
 * employee row.
 *
 * NOTE: this used to emit one row PER department, so someone in 7 departments
 * produced 7 rows — each counting ALL of their tasks, not a share. That both
 * repeated the person and inflated every column total. Rows are now keyed by
 * employee alone and carry the full department list, so each task is counted
 * exactly once.
 */
export type DepartmentMembershipMap = Map<string, { name: string }[]>;

export function computeEmployeeStatusTable(
  tasks: Task[],
  employees: Employee[],
  view: ViewMode,
  departmentMap?: DepartmentMembershipMap,
): EmployeeStatusRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const rows = new Map<string, EmployeeStatusRow>();

  // Preview candidates, accumulated per (employee, bucket) alongside the
  // counts. Kept OUT of the row objects while filling so we can sort by
  // urgency and cap at the end — a running push would have to guess which six
  // tasks matter before it has seen them all.
  const candidates = new Map<string, Map<StatusCellBucket, Task[]>>();
  const addTo = (rowKey: string, bucket: StatusCellBucket, task: Task) => {
    let perBucket = candidates.get(rowKey);
    if (!perBucket) {
      perBucket = new Map();
      candidates.set(rowKey, perBucket);
    }
    const list = perBucket.get(bucket);
    if (list) list.push(task);
    else perBucket.set(bucket, [task]);
  };

  // Resolve the department names a person should be grouped under. Falls
  // back to their primary department (the legacy text column) when there's
  // no membership map or the person has no memberships.
  const departmentsFor = (emp: Employee): string[] => {
    const memberships = departmentMap?.get(emp.id);
    if (memberships && memberships.length > 0) {
      return memberships.map((m) => m.name);
    }
    return [emp.department ?? ""];
  };

  for (const t of tasks) {
    const id = view === "doer" ? t.doerId : t.initiatorId;
    const emp = employeeById.get(id);
    if (!emp) continue;

    // Keyed by employee only — ONE row per person.
    const rowKey = id;
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        employeeId: id,
        employeeName: emp.name,
        departments: departmentsFor(emp).filter((d) => d.length > 0),
        approved: 0,
        notApproved: 0,
        done: 0,
        transferred: 0,
        cancelled: 0,
        pendingTotal: 0,
        needHelp: 0,
        followUp: 0,
        initiated: 0,
        notStarted: 0,
        dontKnow: 0,
        onHold: 0,
        total: 0,
        criticalCount: 0,
        previews: {},
      });
    }

    const row = rows.get(rowKey)!;
    row.total += 1;
    addTo(rowKey, "total", t);

    if (t.priority === "imp_urgent") {
      row.criticalCount += 1;
      addTo(rowKey, "criticalCount", t);
    }

    // Tier-3 (2026-05-20): the approval_status column is the new way
    // to record approved/not_approved/cancelled/transferred verdicts.
    // Bucket those first so they take priority over the lifecycle status.
    if (t.approvalStatus) {
      switch (t.approvalStatus) {
        case "approved":      row.approved    += 1; addTo(rowKey, "approved", t);    continue;
        case "not_approved":  row.notApproved += 1; addTo(rowKey, "notApproved", t); continue;
        case "cancelled":     row.cancelled   += 1; addTo(rowKey, "cancelled", t);   continue;
        case "transferred":   row.transferred += 1; addTo(rowKey, "transferred", t); continue;
      }
    }
    switch (t.status) {
      case "approved":
        row.approved += 1;
        addTo(rowKey, "approved", t);
        break;
      case "not_approved":
        row.notApproved += 1;
        addTo(rowKey, "notApproved", t);
        break;
      case "done":
        row.done += 1;
        addTo(rowKey, "done", t);
        break;
      case "transferred":
        row.transferred += 1;
        addTo(rowKey, "transferred", t);
        break;
      case "cancelled":
        row.cancelled += 1;
        addTo(rowKey, "cancelled", t);
        break;
      case "need_info":           // Tier-3 — rolls into the "need" bucket
                                  // (need_help retired 2026-06-10)
        row.needHelp += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "needHelp", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      case "follow_up":
      case "follow_up_1":         // Tier-3
      case "follow_up_2":         // Tier-3
      case "follow_up_3":         // Tier-3
        row.followUp += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "followUp", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      case "initiated":
        row.initiated += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "initiated", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      case "not_started":
        row.notStarted += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "notStarted", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      // "I haven't assessed this yet". It used to be folded into not_started,
      // which was fine while the table rendered one Pending column; now that
      // every status has its own column, sharing a bucket would make Not
      // Started count tasks that are actually Not Read.
      case "dont_know":
        row.dontKnow += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "dontKnow", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      // Retired 2026-06-10 in favour of need_info, but historical rows still
      // carry it, so it has to keep counting or those tasks vanish.
      case "need_help":
        row.needHelp += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "needHelp", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      // Paused, but still this person's open work. It now has its own bucket:
      // the table renders a column per status, and without one these tasks
      // would count toward Total while appearing in no column — exactly the
      // "columns sum short of the total" bug the default case below guards.
      case "on_hold":
        row.onHold += 1;
        row.pendingTotal += 1;
        addTo(rowKey, "onHold", t);
        addTo(rowKey, "pendingTotal", t);
        break;
      default: {
        // THE BUG THIS REPLACES: the switch had no case for dont_know,
        // need_help or on_hold, so those tasks incremented `total` and then
        // landed in NO status bucket. Every column summed short of the total —
        // a doer whose queue was mostly on_hold showed 2 across the columns
        // against a total of 41.
        //
        // This assignment is the guard against it happening again: `t.status`
        // only narrows to `never` once every member of TASK_STATUSES is
        // handled above, so adding a status to the enum breaks the BUILD here
        // instead of silently dropping rows out of the table.
        const unhandled: never = t.status;
        void unhandled;
        break;
      }
    }
  }

  // Rank each bucket by urgency and cut it to PREVIEW_MAX. Oldest due date
  // first, so the preview leads with the most overdue work; undated tasks sink
  // to the bottom rather than sorting as epoch-0 and hijacking the top.
  const DUE_LAST = Number.POSITIVE_INFINITY;
  const dueKey = (t: Task): number => {
    if (!t.dueAt) return DUE_LAST;
    const d = t.dueAt instanceof Date ? t.dueAt : new Date(t.dueAt as unknown as string);
    const ms = d.getTime();
    return Number.isNaN(ms) ? DUE_LAST : ms;
  };
  const toPreview = (t: Task): StatusCellTask => ({
    id: t.id,
    taskNo: t.taskNo ?? null,
    title: t.title,
    description: t.description ?? null,
    client: t.client ?? null,
    subject: t.subject ?? null,
    dueAt: t.dueAt ?? null,
  });

  for (const [rowKey, perBucket] of candidates) {
    const row = rows.get(rowKey);
    if (!row) continue;
    for (const [bucket, list] of perBucket) {
      row.previews[bucket] = list
        .slice()
        .sort((a, b) => dueKey(a) - dueKey(b))
        .slice(0, PREVIEW_MAX)
        .map(toPreview);
    }
  }

  return [...rows.values()].sort((a, b) => b.total - a.total);
}
