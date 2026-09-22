import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * WHOSE WORK A SURFACE OPENS ON, before anyone touches a filter.
 *
 * ── THE RULE (account holder, 2026-09-12) ────────────────────────────────
 *   Team member  → their own work
 *   Admin        → their own work
 *   Super-admin  → EVERYONE's work
 *
 * An admin used to open /tasks on the whole company while opening the WMS
 * dashboard on themselves — the two surfaces disagreed about what an admin is
 * for, and the answer is now the same on both: an admin is a person with a
 * workload, and seeing it is the point of arriving. Widening to the company is
 * a click away for anyone (the "All employees" row), and it is the default only
 * for the one account whose job is the whole company.
 *
 * ── WHY THIS IS ONE FUNCTION AND NOT SEVEN COPIES ────────────────────────
 * Seven call sites decide this: the dashboard, /tasks, the agenda, the kanban,
 * the archive and the three export routes. They read `me.isAdmin ? undefined :
 * me.id` INDEPENDENTLY, and had already drifted — the agenda always defaulted
 * to the viewer and the kanban always defaulted to everyone, neither matching
 * the page they hang off. A default that disagrees with itself between a list
 * and its own CSV export is the kind of bug nobody reports; they just stop
 * trusting the export.
 *
 * ── PURE, AND FREE OF `server-only` ──────────────────────────────────────
 * The filter bar is a client component and has to know which selection counts
 * as "the default" (it suppresses the active-filter chip for it — nobody chose
 * the default, so offering to clear it is offering to undo nothing). It takes
 * the ANSWER as a prop rather than importing this, but keeping the module
 * client-safe means the two can never need different builds of the same rule.
 */

/** Does this person's view open on the whole company? Super-admins only. */
export function opensOnEveryone(me: { email: string }): boolean {
  return isSuperAdmin(me.email);
}

/**
 * The employee id a task list or dashboard scopes to when the URL says nothing,
 * or `undefined` for "everyone".
 *
 * Feed it straight to `parseFilters({ defaultEmployeeId })` /
 * `parseTaskFilters({ defaultDoerId })`, both of which already treat `undefined`
 * as the all-company default.
 */
export function defaultScopeId(me: { id: string; email: string }): string | undefined {
  return opensOnEveryone(me) ? undefined : me.id;
}
