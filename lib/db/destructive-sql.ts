/**
 * DOES THIS MIGRATION DESTROY ROWS?
 *
 * Pure, no I/O — lives here rather than inside `scripts/apply-all-migrations.ts`
 * so it can be tested without the script's top-level database connection running
 * as a side effect of the import.
 *
 * ── WHAT COUNTS, AND WHAT DELIBERATELY DOES NOT ────────────────────────────
 * Only DDL that loses DATA: dropping a table, column, schema or database;
 * truncating; deleting rows.
 *
 * `DROP INDEX`, `DROP POLICY`, `DROP TRIGGER` and `DROP CONSTRAINT` are NOT
 * flagged, and that exclusion is what makes the guard usable. Twenty-seven
 * migrations in this repo drop and recreate those routinely — none of them lose
 * a row. A guard that fired on ordinary migrations would be switched off inside
 * a week, and a guard nobody runs protects nothing. As written it matches
 * exactly 1 of ~210 migrations here, so when it fires it means something.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * `pnpm db:migrate` applies every un-ledgered migration in filename order,
 * unattended. That is right for additive DDL and badly wrong for a `DROP TABLE`:
 * the command gets run casually, usually to pick up someone else's column.
 *
 * On 2026-08-27 a `0203_drop_attendance_module.sql` reached the tree carrying
 * DROPs for the entire attendance stack, its own header warning "DESTRUCTIVE:
 * all historic punch, leave and attendance-sheet data is lost — back up before
 * applying". Nothing in the pipeline would have paused for it. It was reverted
 * before any migrate run happened to collect it, which was luck.
 */

/**
 * Comment-stripped line matching. A `DROP TABLE` written in a header comment is
 * documentation, not a hazard — and the migrations here carry long explanatory
 * headers that routinely describe what they are about to do.
 */
/**
 * Note the shape of the TRUNCATE arm. An earlier version was
 * `truncate\s+(?:table\s+)?\w` with a trailing `\b`, which put the boundary
 * immediately after a single word character — mid-identifier — so `TRUNCATE
 * punches` did not match. The unit tests caught it. Each alternative now ends on
 * its own keyword and lets `\b` fall where a word actually ends.
 *
 * `TRUNCATE` needs no object pattern at all: there is no non-destructive form of
 * it, and these lines have already had comments stripped.
 */
export const DESTRUCTIVE_SQL_RE =
  /\b(?:drop\s+(?:table|column|schema|database)|truncate|delete\s+from)\b/i;

/** The destructive statements in a migration, in file order. Empty ⇒ additive. */
export function destructiveStatements(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((code) => code.length > 0 && DESTRUCTIVE_SQL_RE.test(code));
}

/** Convenience predicate for callers that only need yes/no. */
export function isDestructiveMigration(contents: string): boolean {
  return destructiveStatements(contents).length > 0;
}
