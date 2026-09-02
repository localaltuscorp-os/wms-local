import "server-only";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { SALARY_NAME_ALIASES } from "@/lib/salary/profile-sheet";

/**
 * Shared sheet-name → employee_id resolver for the attendance-log sync
 * engines. Same report-don't-guess model as lib/salary/breakup-sync.ts:
 * exact normalized match, then the reviewed alias table (same humans as the
 * salary sheet — it's the same HR workbook family). Unmatched names are
 * COUNTED + returned, never guessed and never a crash; the row still lands
 * with employee_id = null because the upsert key is employee_name.
 */
export const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// Sheet-specific spellings → our canonical in-app employee name (the app name is
// the source of truth). Surfaced by the dry run: these current employees appear
// in the HR sheet under a variant spelling and must link to their app record.
const ATT_LOG_NAME_ALIASES: Record<string, string> = {
  "Hitesh Sandeep Vichare": "Hetesh Vichare",
  "Sayyad Daniyal": "Danyal Sayyed",
  "Atul Asthane": "Atul Asthana",
};

const ALIAS = new Map(
  [...Object.entries(SALARY_NAME_ALIASES), ...Object.entries(ATT_LOG_NAME_ALIASES)].map(
    ([sheet, app]) => [normName(sheet), normName(app)],
  ),
);

export interface NameResolver {
  /** employee_id or null (unmatched — also recorded in `unmatched`). */
  resolve(sheetName: string): string | null;
  unmatched: Set<string>;
}

/** Loads the roster once and returns a memoized resolver for the run. */
export async function buildNameResolver(): Promise<NameResolver> {
  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const idByName = new Map(emps.map((e) => [normName(e.name), e.id]));
  const unmatched = new Set<string>();
  return {
    unmatched,
    resolve(sheetName: string) {
      const key = normName(sheetName);
      const id = idByName.get(key) ?? idByName.get(ALIAS.get(key) ?? "") ?? null;
      if (!id) unmatched.add(sheetName);
      return id;
    },
  };
}
