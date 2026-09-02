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

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
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

  const empty: DashboardFilters = {
    startDate: defaultStart,
    endDate: defaultEnd,
    employeeIds: [],
    view: "doer",
    departments: [],
    priorities: [],
    subjects: [],
  };
  if (!parsed.success) return empty;

  const split = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
  const departments = split(parsed.data.dept).filter((d): d is Department =>
    DEPT_SET.has(d as Department),
  );
  const priorities = split(parsed.data.prio).filter(
    (p): p is TaskPriority => PRIO_SET.has(p as TaskPriority),
  );

  return {
    startDate: parsed.data.start ?? defaultStart,
    endDate: parsed.data.end ?? defaultEnd,
    employeeIds: split(parsed.data.emp),
    view: (parsed.data.view ?? "doer") as ViewMode,
    departments,
    priorities,
    subjects: split(parsed.data.subj),
  };
}

export function filtersToSearchString(filters: DashboardFilters): string {
  const sp = new URLSearchParams();
  if (filters.startDate) sp.set("start", filters.startDate.toISOString().slice(0, 10));
  if (filters.endDate)   sp.set("end",   filters.endDate.toISOString().slice(0, 10));
  if (filters.employeeIds.length > 0) sp.set("emp", filters.employeeIds.join(","));
  if (filters.view !== "doer")        sp.set("view", filters.view);
  if (filters.departments.length > 0) sp.set("dept", filters.departments.join(","));
  if (filters.priorities.length > 0)  sp.set("prio", filters.priorities.join(","));
  if (filters.subjects.length > 0)    sp.set("subj", filters.subjects.join(","));
  return sp.toString();
}
