/**
 * EMPLOYEE MASTER — the list's pure filter and sort rules.
 *
 * PURE. No `server-only`, no database, no React.
 *
 * ── WHY THESE ARE NOT IN THE TABLE COMPONENT ───────────────────────────────
 * They were, and they could not be tested there. `master-table.tsx` imports the
 * workspace, which imports the employee actions, which import `lib/db` — so a
 * test that only wanted to check how "Past" is defined pulled in the database
 * client and failed on missing environment variables before running an
 * assertion.
 *
 * The rules themselves are the part worth testing exhaustively, so they live
 * here, the way `lib/products/label.ts` was split out for the same reason.
 */

/** Every value `statusOf` in ./master-query.ts can return. */
export const MASTER_STATUS_VALUES = [
  "active",
  "probation",
  "inactive",
  "offboarded",
] as const;

/**
 * THE EMPLOYEE STATUS CONTROL — All | Current | Probation | Past.
 *
 * ── THE FOUR ARE EXHAUSTIVE AND MUTUALLY EXCLUSIVE ────────────────────────
 * They map onto the four values `statusOf` already returns:
 *
 *     Current   → active                    (employed, past probation)
 *     Probation → probation                 (employed, still on probation)
 *     Past      → inactive OR offboarded    (left, or deactivated)
 *
 * So Current + Probation + Past = All, with no row in two buckets and none
 * missing. That matters more than it looks: a filter set whose parts do not add
 * up to the whole silently hides people, and nobody counts the rows to notice.
 *
 * Probation is deliberately NOT folded into Current. Somebody on probation is
 * employed, but they are the group an HR administrator most often wants to look
 * at on its own, which is the entire reason this control exists.
 */
export const EMPLOYEE_STATUS_TABS = ["all", "current", "probation", "past"] as const;
export type EmployeeStatusTab = (typeof EMPLOYEE_STATUS_TABS)[number];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatusTab, string> = {
  all: "All",
  current: "Current",
  probation: "Probation",
  past: "Past",
};

/**
 * Does a row's status belong in this tab?
 *
 * An UNRECOGNISED status matches only "All". If `statusOf` ever gains a fifth
 * value it will show up as a hole in the counts — All greater than the sum of
 * the other three — rather than being quietly filed under Past. A visible
 * discrepancy is recoverable; a wrong bucket is not noticed at all.
 */
export function matchesStatusTab(status: string, tab: EmployeeStatusTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "current":
      return status === "active";
    case "probation":
      return status === "probation";
    case "past":
      // Both ways of no longer being here. Kept together because the
      // distinction — resigned versus deactivated — is a Status-column detail,
      // not a different question.
      return status === "inactive" || status === "offboarded";
  }
}

/**
 * Sort key for an employee code: the prefix, then the number AS A NUMBER.
 *
 * "A-101" sorted as text puts A-1000 between A-100 and A-101, and K-9 after
 * K-101. Padding the sequence to a fixed width gives one string that sorts
 * correctly on both halves, which is what the table's single `sort` slot takes.
 *
 * An unissued code sorts LAST. "Not issued" is not a low number, and sorting it
 * first buries everybody who has a code beneath everybody who does not.
 *
 * Deliberately does not import `parseEmployeeCode`: the format is two fields
 * and a dash, and matching it here keeps this module free of any dependency at
 * all. The regex is the same one `employee-code.ts` documents.
 */
const CODE_RE = /^([A-Z]I?)-(\d{1,9})$/;

export function codeSortValue(code: string | null | undefined): string {
  const m = CODE_RE.exec((code ?? "").trim().toUpperCase());
  if (!m) return "ZZZ~";
  return `${m[1]}-${m[2]!.padStart(9, "0")}`;
}
