/**
 * THE BUSINESS FUNCTIONS — one definition, shared by every dashboard section
 * that offers the toggle.
 *
 * ── WHAT REPLACED WHAT ───────────────────────────────────────────────────
 * This supersedes lib/teams/app-team.ts, which split the roster two ways:
 * App Team and Non-App Team. That split answered one question ("is this a
 * developer?") and the board is read for a different one — how each FUNCTION
 * of the business is doing. "Non-App Team" lumped Sales, HR, Accounts and
 * Operations into a single tab, which is precisely the comparison anyone
 * looking at an overdue board wants to make.
 *
 * TEAM AND FUNCTION ARE THE SAME WORD HERE. The dashboards previously said
 * "team"; they now say "function", and there is no second vocabulary — a
 * section cannot relabel a tab locally because the labels live here.
 *
 * ── MATCHING IS BY PATTERN, NOT EQUALITY ─────────────────────────────────
 * Department names are free text from an admin-managed table
 * (/admin/departments), so equality is too brittle to use: the Apps side alone
 * exists as "Apps", "App Devp" and "BSS App", and Handholding was spelled
 * "Hand Holding" until migration 0023 renamed it. A pattern catches every
 * variant, and keeps catching the next one nobody has created yet.
 *
 * ── THE COST OF A FIXED LIST ─────────────────────────────────────────────
 * This list is a claim about the org that lives in code. A department matching
 * none of the eight lands in `others` — correct, but invisible. If `others`
 * ever grows into one of the larger tabs, that is this list telling you it has
 * gone stale, not a bug.
 */

/** The nine mutually exclusive views of a per-person list, `all` included. */
export type FunctionView =
  | "all"
  | "sales"
  | "marketing"
  | "operations"
  | "handholding"
  | "hr"
  | "admin"
  | "accounts"
  | "apps"
  | "others";

/** A real function — every view except `all`, which is the absence of a filter. */
export type BusinessFunction = Exclude<FunctionView, "all">;

/**
 * The eight functions and how each is recognised, in the order the tab bar
 * shows them. `others` is absent because it is not a pattern: it is the
 * absence of all eight.
 *
 * ORDER IS PRECEDENCE. A department is tested against these top to bottom and
 * takes the first match, so a hypothetical "Sales Operations" reads as Sales
 * rather than Operations. Nothing in the current department list matches twice;
 * the order is fixed so that the day one does, the answer is decided here
 * rather than by whichever branch happened to run first.
 */
const FUNCTION_PATTERNS: { key: BusinessFunction; test: RegExp }[] = [
  { key: "sales", test: /sales/i },
  { key: "marketing", test: /marketing/i },
  /* "Operations", NOT just "ops". A plain substring test for "ops" does not
     match the word Operations at all — o-p-e-r-a-t-i-o-n-s contains no "ops" —
     so the obvious spelling of this rule produces a tab reading 0 forever.
     Both spellings are matched. */
  { key: "operations", test: /\bops\b|operation/i },
  /* "Hand Holding" with the space was the name until migration 0023; rows
     written before it may still carry the old spelling. */
  { key: "handholding", test: /hand\s*holding/i },
  /* WORD-bounded. A bare /hr/i substring would claim any department with those
     two letters adjacent inside a longer word. */
  { key: "hr", test: /\bhr\b|human\s*resource/i },
  { key: "accounts", test: /account/i },
  /* Checked AFTER accounts and the rest: "Admin" is a short, common word and a
     department like "Sales Admin" belongs to Sales. */
  { key: "admin", test: /admin/i },
  /* Apps/IT. `\bapp` (a word STARTING "app") rather than an exact name, so
     "Apps", "App Devp" and "BSS App" all land here without being listed. `\bit\b`
     picks up an IT department without matching the letters inside other words. */
  { key: "apps", test: /\bapp|\bit\b|\bi\.t\.?\b/i },
];

/**
 * The eight function keys in MATCH-PRECEDENCE order.
 *
 * Exported so the tab order in FUNCTION_VIEWS can be checked against the
 * matcher rather than trusted: the two lists are written out separately (they
 * answer different questions) and nothing but a test stops a ninth function
 * being added to the matcher and quietly never getting a tab.
 */
export const BUSINESS_FUNCTIONS: readonly BusinessFunction[] = FUNCTION_PATTERNS.map(
  (f) => f.key,
);

/** The label for each view. A section cannot relabel a tab locally. */
export const FUNCTION_LABELS: Record<FunctionView, string> = {
  all: "All Employees",
  sales: "Sales",
  marketing: "Marketing",
  operations: "Operations",
  handholding: "Handholding",
  hr: "HR",
  admin: "Admin",
  accounts: "Accounts",
  apps: "Apps/IT",
  others: "Others",
};

/**
 * Every view in TAB order: All, the eight functions, then Others.
 *
 * DELIBERATELY NOT derived from FUNCTION_PATTERNS. That list is ordered by
 * MATCH PRECEDENCE — Admin is tested late so "Sales Admin" reads as Sales —
 * and precedence is not the order a reader wants to scan. This is the order the
 * business named them in, which is what the bar shows.
 *
 * Others sits last: it is the catch-all, and a reader scanning left to right
 * should meet the named functions first.
 */
export const FUNCTION_VIEWS: readonly FunctionView[] = [
  "all",
  "sales",
  "marketing",
  "operations",
  "handholding",
  "hr",
  "admin",
  "accounts",
  "apps",
  "others",
] as const;

/** Which function a single department name falls in, or null for none. */
export function functionOfDepartment(name: string | null): BusinessFunction | null {
  if (!name) return null;
  return FUNCTION_PATTERNS.find((f) => f.test.test(name))?.key ?? null;
}

/** Normalise the two shapes the sections feed this: one string, or a list. */
function toList(
  departments: string | readonly (string | null)[] | null,
): string[] {
  if (departments == null) return [];
  const list = Array.isArray(departments)
    ? departments
    : [departments as string];
  return list.filter((d): d is string => Boolean(d));
}

/**
 * Every function this person belongs to.
 *
 * ANY-of across their departments, because a person can hold several: someone
 * in both Apps and HR belongs to both tabs. Demanding that every department
 * agree would drop multi-department people out of all of them, so they would
 * appear under All Employees and nowhere else.
 */
export function functionsOf(
  departments: string | readonly (string | null)[] | null,
): BusinessFunction[] {
  const found = toList(departments)
    .map(functionOfDepartment)
    .filter((f): f is BusinessFunction => f !== null);
  return [...new Set(found)];
}

/**
 * Does this person belong under `view`? The single membership rule behind every
 * function toggle on the dashboard.
 *
 * `others` is the exact complement of the eight named functions, so the tabs
 * PARTITION the roster and their counts always sum to All Employees — nobody
 * is filtered off the board by a list that forgot them. A person with no
 * department at all lands in Others, which is where an "Unassigned" tab would
 * otherwise go.
 *
 * A multi-function person is counted under EACH function they hold, so the
 * eight named counts can sum to more than All. That is correct and not a
 * total; Others is still the exact complement, since it holds precisely the
 * people who matched nothing.
 */
export function inFunctionView(
  departments: string | readonly (string | null)[] | null,
  view: FunctionView,
): boolean {
  if (view === "all") return true;
  const fns = functionsOf(departments);
  if (view === "others") return fns.length === 0;
  return fns.includes(view);
}
