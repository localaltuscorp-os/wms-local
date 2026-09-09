/**
 * THE SIX DEPARTMENT BUCKETS — the fixed roll-up the dashboard filters by.
 *
 * ── WHY FIXED, AFTER A DERIVED BAR ───────────────────────────────────────
 * The tab bar used to be built from whatever departments the visible rows
 * carried. That is the more robust shape in the abstract, and on this org's
 * real data it produced eleven-plus tabs — HR, Accounts, Founder, Social
 * Media, Admin, Graduate Programs, Lead Generation, Videos, Business
 * Development, Consulting, Unassigned — most of them one or two people. A bar
 * that wide is not a filter; it is a second table of contents, and the
 * comparison it was there to support (how do the big teams stack up) was
 * unreadable inside it. Six buckets is the answer to that.
 *
 * The cost is the one a derived bar did not have: this list is a claim about
 * the org that lives in code. Add a department the four named buckets do not
 * match and it lands silently in Others — correct, but invisible, so if
 * Others ever grows into the largest tab it is telling you this list is stale.
 *
 * ── MATCHING IS SUBSTRING, CASE-INSENSITIVE ──────────────────────────────
 * Department names are free text from an admin-managed table, so equality is
 * too brittle to use: the App side alone appears as "Apps", "App Devp" and
 * "BSS App". A contains-check catches every variant and keeps catching the
 * next one nobody has created yet.
 */
import { isAppDepartment } from "@/lib/teams/app-team";

export type DeptBucket = "all" | "ops" | "sales" | "marketing" | "app" | "others";

/**
 * The three pattern-matched buckets. App is absent deliberately — see
 * `bucketOfName` — and so are `all` and `others`, neither of which is a
 * pattern: `all` matches everything, `others` is the absence of the rest.
 */
const NAMED: { key: "ops" | "sales" | "marketing"; test: RegExp }[] = [
  /* "Operations", NOT just "ops". A plain substring test for "ops" does not
     match the word Operations at all — o-p-e-r-a-t-i-o-n-s contains no "ops" —
     so the obvious spelling of this rule produces a tab reading 0 forever if
     the department is spelled out. Both spellings are matched. */
  { key: "ops", test: /\bops\b|operation/i },
  { key: "sales", test: /sales/i },
  { key: "marketing", test: /marketing/i },
];

/** Which named bucket a single department name falls in, or null for none. */
function bucketOfName(name: string): Exclude<DeptBucket, "all" | "others"> | null {
  /* App is checked first and through `isAppDepartment` rather than a fourth
     regex here. That helper already defines the App side for the Aging Heatmap
     and Overdue by Person, and three sections disagreeing about who is App
     team is exactly the bug it was extracted to prevent. */
  if (isAppDepartment(name)) return "app";
  return NAMED.find((b) => b.test.test(name))?.key ?? null;
}

/**
 * Does an employee's department list belong under `bucket`?
 *
 * ANY-of across the person's departments: someone in both Sales and HR is a
 * Sales person for this bar, not an Other. A person can hold several
 * departments, so the alternative — demanding every one of them match — would
 * drop multi-department people out of every tab but All.
 *
 * An employee with NO departments at all falls to Others, which is where the
 * derived bar's "Unassigned" tab went.
 */
export function inDeptBucket(departments: string[], bucket: DeptBucket): boolean {
  if (bucket === "all") return true;
  const named = departments.filter(Boolean).map(bucketOfName);
  if (bucket === "others") return !named.some((b) => b !== null);
  return named.includes(bucket);
}

/** The six tabs, in order, with their labels. Counts are supplied by callers. */
export const DEPT_BUCKETS: { key: DeptBucket; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ops", label: "Ops Team" },
  { key: "sales", label: "Sales Team" },
  { key: "marketing", label: "Marketing Team" },
  { key: "app", label: "App Team" },
  { key: "others", label: "Others" },
];
