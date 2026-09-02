import { db, employees } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Returns the employee roster ordered by name.
 *
 * Defaults to ACTIVE-ONLY because the vast majority of callers feed
 * pickers (filter bars, assign-doer, reassign) where deactivated
 * employees should not be selectable. Pass `{ includeInactive: true }`
 * for admin/export views that need the full roster including
 * deactivated rows (e.g. the employees CSV export and the
 * /admin/activity + /admin/notifications recipient filters that can
 * filter on a deactivated user's historical events).
 */
export async function listEmployees(
  opts: { includeInactive?: boolean } = {},
) {
  const q = db.select().from(employees);
  return opts.includeInactive
    ? q.orderBy(asc(employees.name))
    : q.where(eq(employees.isActive, true)).orderBy(asc(employees.name));
}

export interface EmployeeOption {
  id: string;
  name: string;
}

/**
 * Slim {id,name} projection for pickers — filter-bar, assign-doer,
 * reassign-doer, etc. The full row from `listEmployees` carries 20+
 * columns including channel-config and timestamps that get serialised
 * into the RSC payload for every page render even though pickers only
 * ever read id + name. Cached with the `employees` tag so the picker
 * payload is one cache hit until an employee row actually changes.
 */
export const listEmployeeOptions = unstable_cache(
  async (): Promise<EmployeeOption[]> => {
    return db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  },
  ["list-employee-options-active"],
  { tags: [CACHE_TAGS.employees], revalidate: 600 },
);
