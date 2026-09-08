import { z } from "zod";
import type { DashboardFilters, ViewMode } from "@/lib/types";
import {
  DEPARTMENTS,
  TASK_PRIORITIES,
  type Department,
  type TaskPriority,
} from "@/db/enums";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(s + "T00:00:00.000Z"));

const filtersSchema = z.object({
  start: isoDate.optional(),
  end: isoDate.optional(),
  emp: z.string().optional(),
  view: z.enum(["doer", "initiator"]).optional(),
  dept: z.string().optional(),
  prio: z.string().optional(),
  subj: z.string().optional(),
});

const DEPT_SET = new Set<Department>(DEPARTMENTS);
const PRIO_SET = new Set<TaskPriority>(TASK_PRIORITIES);

/** `?emp=all` — the whole company, asked for deliberately. */
const EMP_ALL = "all";

/**
 * @param opts.defaultEmployeeId  Whose numbers to show when the URL names
 *   nobody. Pass the VIEWER's id: the dashboard opens on your own performance
 *   and you widen it from there, rather than opening on the whole company and
 *   making you find yourself in it. Omit it and the old behaviour (everyone)
 *   is unchanged — which is what the drill-downs that re-parse a shared link
 *   without a viewer rely on.
 *
 * The three-way ladder mirrors `parseTaskFilters` exactly, on purpose: the two
 * parsers now answer the same question the same way, so `?emp=all` means the
 * same thing on /tasks and on /dashboard.
 */
export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
  opts: { defaultEmployeeId?: string } = {},
): DashboardFilters {
  const raw = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [
      k,
      Array.isArray(v) ? v[0] : v,
    ]),
  );
  const parsed = filtersSchema.safeParse(raw);

  const defaultEnd = new Date();
  const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  // The default scope, used both when the URL says nothing and when it is
  // malformed — a bad query string must not silently widen the view to the
  // whole company.
  const defaultIds = opts.defaultEmployeeId ? [opts.defaultEmployeeId] : [];
  const defaultMode: DashboardFilters["assigneeMode"] =
    opts.defaultEmployeeId ? "default" : "all";

  const empty: DashboardFilters = {
    startDate: defaultStart,
    endDate: defaultEnd,
    employeeIds: defaultIds,
    view: "doer",
    departments: [],
    priorities: [],
    subjects: [],
    assigneeMode: defaultMode,
  };
  if (!parsed.success) return empty;

  const split = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
  const departments = split(parsed.data.dept).filter((d): d is Department =>
    DEPT_SET.has(d as Department),
  );
  const priorities = split(parsed.data.prio).filter(
    (p): p is TaskPriority => PRIO_SET.has(p as TaskPriority),
  );

  const empRaw = parsed.data.emp;
  let employeeIds: string[];
  let assigneeMode: DashboardFilters["assigneeMode"];
  if (empRaw === undefined) {
    employeeIds = defaultIds;
    assigneeMode = defaultMode;
  } else if (empRaw === EMP_ALL || empRaw === "") {
    employeeIds = [];
    assigneeMode = "all";
  } else {
    employeeIds = split(empRaw);
    // An `emp=` that parses to nothing usable is "everyone", not "the viewer":
    // the URL did ask a question, it just named no one who exists.
    assigneeMode = employeeIds.length > 0 ? "specific" : "all";
  }

  return {
    startDate: parsed.data.start ?? defaultStart,
    endDate: parsed.data.end ?? defaultEnd,
    employeeIds,
    view: (parsed.data.view ?? "doer") as ViewMode,
    departments,
    priorities,
    subjects: split(parsed.data.subj),
    assigneeMode,
  };
}

export function filtersToSearchString(filters: DashboardFilters): string {
  const sp = new URLSearchParams();
  if (filters.startDate) sp.set("start", filters.startDate.toISOString().slice(0, 10));
  if (filters.endDate)   sp.set("end",   filters.endDate.toISOString().slice(0, 10));
  if (filters.employeeIds.length > 0) sp.set("emp", filters.employeeIds.join(","));
  // "Everyone" has to be written down now that an ABSENT `emp` means the
  // viewer — otherwise round-tripping an all-company view through this
  // function would quietly narrow it to one person.
  else if (filters.assigneeMode === "all") sp.set("emp", EMP_ALL);
  if (filters.view !== "doer")        sp.set("view", filters.view);
  if (filters.departments.length > 0) sp.set("dept", filters.departments.join(","));
  if (filters.priorities.length > 0)  sp.set("prio", filters.priorities.join(","));
  if (filters.subjects.length > 0)    sp.set("subj", filters.subjects.join(","));
  return sp.toString();
}
