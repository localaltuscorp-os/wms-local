import {
  FINE_BUCKET_BY_SLUG,
  FINE_BUCKET_SLUGS,
} from "@/lib/transforms/aging-buckets-fine";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  DEPARTMENTS,
  type TaskStatus,
  type TaskPriority,
  type Department,
} from "@/db/enums";
import type { TaskListFilters } from "@/lib/types";

const STATUS_SET = new Set<TaskStatus>(TASK_STATUSES);
const PRIO_SET = new Set<TaskPriority>(TASK_PRIORITIES);
const DEPT_SET = new Set<Department>(DEPARTMENTS);

/** The three activity families the manager board links out from. */
export const ACTIVITY_TYPES = ["goals", "tasks", "commitments"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

const split = (v: unknown): string[] =>
  typeof v === "string" ? v.split(",").filter(Boolean) : [];

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

const DEFAULT_START = new Date("2026-01-01T00:00:00.000Z");
function todayUtcMidnight(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Sentinel value for ?emp=all — meaning "explicitly show all assignees,
 *  do not apply the default-to-me behavior for non-admins". */
const EMP_ALL = "all";

export interface ParseTaskFiltersOptions {
  /** If set AND the `emp` URL param is absent, default `doerIds` to `[defaultDoerId]`.
   *  Pass `me.id` for non-admins to scope the list to "assigned to me" by default.
   *  Admins should leave this `undefined`. */
  defaultDoerId?: string;
}

export function parseTaskFilters(
  searchParams: Record<string, string | string[] | undefined>,
  archived: boolean,
  opts: ParseTaskFiltersOptions = {},
): TaskListFilters {
  const get = (k: string) => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const rawStatuses = split(get("status"));
  const statuses = rawStatuses.filter((s): s is TaskStatus =>
    STATUS_SET.has(s as TaskStatus),
  );
  // "archived" is a pseudo-status chip in the filter: it isn't a real
  // `tasks.status` value (archived lives on its own boolean column), so
  // selecting it flips the list to show archived tasks. Any real status chips
  // selected alongside it still narrow by status within the archived set.
  const wantsArchived = rawStatuses.includes("archived");
  // Accept 1 / true / yes so a hand-written link behaves like the generated one.
  const unread = ["1", "true", "yes"].includes((get("unread") ?? "").toLowerCase());
  const priorities = split(get("prio")).filter((p): p is TaskPriority =>
    PRIO_SET.has(p as TaskPriority),
  );
  const departments = split(get("dept")).filter((d): d is Department =>
    DEPT_SET.has(d as Department),
  );

  // Team scope. Kept as raw strings here — "mine" needs the org chart to
  // expand, which is a DB read this pure parser must not do.
  // `my_team` is accepted as an alias for `mine`: the canonical value stays
  // `mine` because links using it are already in the wild, but the newer
  // spelling should not 404 into an unfiltered list.
  const teams = split(get("team")).map((t) => (t === "my_team" ? "mine" : t));

  const id = get("id");

  // Assignee resolution:
  //  - `emp` absent  → default to [defaultDoerId] if provided, else []
  //  - `emp=all`     → explicitly all assignees (clears default)
  //  - `emp=<ids>`   → comma-separated IDs
  // `doer` is an accepted alias for `emp`. The manager-activity board links
  // out as ?manager=&doer=&type=, and those three names describe the same
  // two axes this parser already has: doer IS the assignee, manager IS the
  // initiator. Aliasing here means one resolution ladder, not two.
  const empRaw = get("emp") ?? get("doer");
  const empPresent = empRaw !== undefined;
  let doerIds: string[];
  let assigneeMode: "default" | "all" | "specific";
  if (!empPresent) {
    if (opts.defaultDoerId) {
      doerIds = [opts.defaultDoerId];
      assigneeMode = "default";
    } else {
      doerIds = [];
      assigneeMode = "all";
    }
  } else if (empRaw === EMP_ALL || empRaw === "") {
    doerIds = [];
    assigneeMode = "all";
  } else {
    doerIds = split(empRaw);
    assigneeMode = "specific";
  }

  return {
    startDate: parseDate(get("start")) ?? DEFAULT_START,
    endDate: parseDate(get("end")) ?? todayUtcMidnight(),
    statuses,
    doerIds,
    initiatorIds: split(get("initiator") ?? get("manager")),
    departments,
    teams,
    viewerId: opts.defaultDoerId ?? null,
    priorities,
    subjects: split(get("subj")),
    clients: split(get("client")),
    taskId: typeof id === "string" && id.length > 0 ? id : null,
    archived: archived || wantsArchived,
    unread,
    // Accepts true/1/yes so a hand-typed or shared link is forgiving; anything
    // else (including the param being absent) is false.
    overdue: ["true", "1", "yes"].includes((get("overdue") ?? "").toLowerCase()),
    // Unknown slugs resolve to null rather than throwing: a stale bookmark
    // should show an unfiltered list, not an error page.
    ageRange: FINE_BUCKET_BY_SLUG[(get("age_range") ?? "").trim()] ?? null,
    assigneeMode,
    // Which activity family the click came from. Only `tasks` narrows this
    // list -- /tasks cannot render goals or commitments, so those values are
    // carried for the page to notice, not silently applied as a filter that
    // would return a task list dressed up as something else.
    activityType: ACTIVITY_TYPES.includes((get("type") ?? "") as ActivityType)
      ? ((get("type") as ActivityType))
      : null,
  };
}

export function taskFiltersToSearchString(f: TaskListFilters): string {
  const sp = new URLSearchParams();
  if (f.startDate) sp.set("start", f.startDate.toISOString().slice(0, 10));
  if (f.endDate)   sp.set("end",   f.endDate.toISOString().slice(0, 10));
  if (f.statuses.length > 0)     sp.set("status", f.statuses.join(","));
  // Round-trip the assignee selector. "default" intentionally omits the param
  // so re-parsing (without a defaultDoerId) resolves to "all"; the page-level
  // defaulting handles the non-admin scoping at the call site.
  if (f.assigneeMode === "all") {
    sp.set("emp", EMP_ALL);
  } else if (f.assigneeMode === "specific" && f.doerIds.length > 0) {
    sp.set("emp", f.doerIds.join(","));
  }
  if (f.initiatorIds.length > 0) sp.set("initiator", f.initiatorIds.join(","));
  if (f.departments.length > 0)  sp.set("dept", f.departments.join(","));
  if (f.teams.length > 0)        sp.set("team", f.teams.join(","));
  if (f.priorities.length > 0)   sp.set("prio", f.priorities.join(","));
  if (f.subjects.length > 0)     sp.set("subj", f.subjects.join(","));
  if (f.clients.length > 0)      sp.set("client", f.clients.join(","));
  if (f.taskId) sp.set("id", f.taskId);
  if (f.unread) sp.set("unread", "1");
  if (f.overdue) sp.set("overdue", "true");
  if (f.ageRange) sp.set("age_range", FINE_BUCKET_SLUGS[f.ageRange]);
  return sp.toString();
}
