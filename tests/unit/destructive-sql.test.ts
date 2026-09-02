import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  destructiveStatements,
  isDestructiveMigration,
} from "@/lib/db/destructive-sql";

/**
 * THE MIGRATION GUARD.
 *
 * `pnpm db:migrate` applies every un-ledgered migration unattended. This
 * detector is the only thing standing between that and a `DROP TABLE`, so it has
 * two jobs and both are load-bearing:
 *
 *   1. CATCH the real thing — the fixture below is the actual
 *      `0203_drop_attendance_module.sql` that reached the tree on 2026-08-27.
 *   2. STAY QUIET on ordinary migrations. 27 files here drop and recreate
 *      indexes, policies and triggers as a matter of course. A guard that fired
 *      on those would be disabled within a week, and a disabled guard protects
 *      nothing — so the false-positive tests matter as much as the true-positive
 *      one.
 */

const REAL_DROP_MIGRATION = readFileSync(
  "tests/fixtures/0203_drop_attendance_module.sql.txt",
  "utf8",
);

describe("catches the migration this guard was built for", () => {
  it("flags the real 0203_drop_attendance_module.sql", () => {
    expect(isDestructiveMigration(REAL_DROP_MIGRATION)).toBe(true);
  });

  it("reports every DROP TABLE in it, not just the first", () => {
    const found = destructiveStatements(REAL_DROP_MIGRATION);
    // The operator is shown this list to decide on. Missing entries would make a
    // 12-table drop look like a 1-table drop.
    expect(found.length).toBeGreaterThanOrEqual(12);
    expect(found.join("\n").toLowerCase()).toContain("drop table");
  });
});

describe("flags the destructive forms", () => {
  const cases: [string, string][] = [
    ["drop table", "DROP TABLE attendance_logs;"],
    ["drop table if exists", "DROP TABLE IF EXISTS attendance_logs CASCADE;"],
    ["drop column", "ALTER TABLE employees DROP COLUMN weekly_off;"],
    ["truncate", "TRUNCATE TABLE punches;"],
    ["truncate without TABLE", "TRUNCATE punches;"],
    ["delete from", "DELETE FROM notifications WHERE kind = 'attendance';"],
    ["drop schema", "DROP SCHEMA public CASCADE;"],
    ["lowercase", "drop table foo;"],
  ];
  for (const [name, sql] of cases) {
    it(name, () => expect(isDestructiveMigration(sql)).toBe(true));
  }
});

describe("stays quiet on the safe DROPs this repo uses constantly", () => {
  const cases: [string, string][] = [
    ["drop index", "DROP INDEX IF EXISTS tasks_status_idx;"],
    ["drop policy", 'DROP POLICY IF EXISTS "read own" ON documents;'],
    ["drop trigger", "DROP TRIGGER IF EXISTS trg_punch ON attendance_logs;"],
    ["drop constraint", "ALTER TABLE tasks DROP CONSTRAINT tasks_chk;"],
    ["drop default", "ALTER TABLE tasks ALTER COLUMN x DROP DEFAULT;"],
    ["drop not null", "ALTER TABLE tasks ALTER COLUMN x DROP NOT NULL;"],
    ["add column", "ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS x boolean;"],
    ["create table", "CREATE TABLE IF NOT EXISTS leave_categories (id uuid);"],
  ];
  for (const [name, sql] of cases) {
    it(name, () => expect(isDestructiveMigration(sql)).toBe(false));
  }
});

describe("reads code, not prose", () => {
  it("ignores a DROP TABLE described in a comment", () => {
    // These migrations carry long headers that narrate what they do. Treating
    // the narration as the act would flag most of the directory.
    const sql = `
-- This migration does NOT drop table anything; it only adds a column.
-- Historically we would DELETE FROM the staging table here, but no longer.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_end date;
`;
    expect(isDestructiveMigration(sql)).toBe(false);
  });

  it("still catches code on a line that also carries a trailing comment", () => {
    expect(isDestructiveMigration("DROP TABLE punches; -- gone for good")).toBe(true);
  });
});

describe("the live migrations directory", () => {
  it("has almost none flagged — the signal is not background noise", () => {
    const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql"));
    const flagged = files.filter((f) =>
      isDestructiveMigration(readFileSync(`db/migrations/${f}`, "utf8")),
    );
    // If this ever grows large the guard has become noise and someone will turn
    // it off; that is the failure mode worth catching early, so the bound is
    // deliberately tight rather than generous.
    expect(flagged.length).toBeLessThanOrEqual(3);
    expect(files.length).toBeGreaterThan(150);
  });
});
