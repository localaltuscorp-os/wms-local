import { describe, it, expect } from "vitest";
import { dbErrorAdvice, dbErrorMessage, dbErrorRemedy, schemaIsBehind } from "@/lib/db/error";

/**
 * THE BLIND TOAST.
 *
 * drizzle-orm wraps every failed statement in a `DrizzleQueryError` whose
 * `.message` is ONLY EVER `Failed query: <sql>\nparams: <params>`. The reason
 * the statement failed lives on `.cause`, where the near-universal
 * `err instanceof Error ? err.message : String(err)` never looks.
 *
 * On 2026-08-30 that cost us: wiping attendance died with
 *
 *     DB: Failed query: delete from "attendance_week_ack" params:
 *
 * which names the TABLE and hides the PROBLEM. The sentence that was thrown
 * away — `relation "attendance_week_ack" does not exist` — is the whole
 * diagnosis. These tests exist so that message can never be swallowed again.
 */

/** The exact shape drizzle-orm 0.45 throws (see drizzle-orm/errors.js). */
function drizzleQueryError(query: string, params: unknown[], cause?: Error): Error {
  const err = new Error(`Failed query: ${query}\nparams: ${params}`);
  return Object.assign(err, { query, params, cause });
}

/** postgres.js copies Postgres' fields onto the error in wire snake_case. */
function postgresError(
  message: string,
  fields: {
    code?: string;
    detail?: string;
    hint?: string;
    constraint_name?: string;
    table_name?: string;
    column_name?: string;
  } = {},
): Error {
  return Object.assign(new Error(message), { severity: "ERROR", ...fields });
}

describe("dbErrorMessage", () => {
  it("surfaces the Postgres cause that drizzle buried — the airstrike bug", () => {
    const err = drizzleQueryError(
      'delete from "attendance_week_ack"',
      [],
      postgresError('relation "attendance_week_ack" does not exist', { code: "42P01" }),
    );

    const msg = dbErrorMessage(err);

    expect(msg).toContain('relation "attendance_week_ack" does not exist');
    expect(msg).toContain("42P01");
  });

  it("leads with the reason, not with drizzle's boilerplate", () => {
    const err = drizzleQueryError(
      'delete from "attendance_week_ack"',
      [],
      postgresError('relation "attendance_week_ack" does not exist', { code: "42P01" }),
    );

    // The operator reads the first few words of a toast and nothing else.
    expect(dbErrorMessage(err).startsWith("Failed query")).toBe(false);
    expect(dbErrorMessage(err)).toMatch(/^relation "attendance_week_ack" does not exist/);
  });

  it("keeps the failing statement for context", () => {
    const err = drizzleQueryError(
      'delete from "attendance_week_ack"',
      [],
      postgresError("permission denied", { code: "42501" }),
    );

    expect(dbErrorMessage(err)).toContain('delete from "attendance_week_ack"');
  });

  it("includes Postgres detail and hint when it offers them", () => {
    const err = drizzleQueryError(
      'delete from "employees"',
      [],
      postgresError('update or delete on table "employees" violates foreign key constraint', {
        code: "23503",
        detail: 'Key (id)=(abc) is still referenced from table "tasks".',
        hint: "Delete the referencing rows first.",
      }),
    );

    const msg = dbErrorMessage(err);
    expect(msg).toContain('still referenced from table "tasks"');
    expect(msg).toContain("Delete the referencing rows first.");
  });

  it("never returns drizzle boilerplate alone when no cause was attached", () => {
    const err = drizzleQueryError('delete from "attendance_week_ack"', []);

    const msg = dbErrorMessage(err);
    expect(msg.startsWith("Failed query")).toBe(false);
    // The statement is still all we know, so it must survive.
    expect(msg).toContain('delete from "attendance_week_ack"');
  });

  it("passes ordinary errors straight through", () => {
    expect(dbErrorMessage(new Error("connection terminated"))).toBe("connection terminated");
  });

  it("survives a non-Error throw", () => {
    expect(dbErrorMessage("boom")).toBe("boom");
    expect(dbErrorMessage(null)).toBeTruthy();
    expect(dbErrorMessage(undefined)).toBeTruthy();
  });

  it("terminates on a cause cycle instead of hanging the request", () => {
    // Reporting an error must never be the thing that takes the box down.
    const a = new Error("a");
    const b = new Error("b");
    Object.assign(a, { cause: b });
    Object.assign(b, { cause: a });

    expect(dbErrorMessage(a)).toBeTruthy();
  });

  it("walks a nested cause chain to the deepest reason", () => {
    const root = postgresError("deadlock detected", { code: "40P01" });
    const mid = Object.assign(new Error("tx failed"), { cause: root });
    const top = drizzleQueryError("update x", [], mid as Error);

    expect(dbErrorMessage(top)).toContain("deadlock detected");
    expect(dbErrorMessage(top)).toContain("40P01");
  });
});

/**
 * ── FROM "WHAT WENT WRONG" TO "WHICH MIGRATION IS MISSING" ─────────────────
 *
 * On 2026-09-18 the owner ticked "Issue letters" on an employee record and got:
 *
 *   Failed query: insert into "capability_grants" (...) values (default, $1, …)
 *   params: 733b3a89-…,mansimedhekar.altuscorp@gmail.com,hr.letters.issue,…
 *
 * The answer — "this database still forbids that value, because migration 0228
 * has not been applied" — was one step from the cause and unreachable from the
 * screen. Two bugs in one message: it named no remedy, and by echoing the bound
 * parameters it put an employee's email address in a UI toast.
 */
describe("dbErrorRemedy", () => {
  it("names the missing migration for a CHECK violation, and the constraint", () => {
    const err = drizzleQueryError(
      'insert into "capability_grants" ("id", "employee_id") values (default, $1, $2)',
      [],
      postgresError('new row for relation "capability_grants" violates check constraint "capability_grants_capability_chk"', {
        code: "23514",
        constraint_name: "capability_grants_capability_chk",
      }),
    );

    const remedy = dbErrorRemedy(err);
    expect(remedy).toMatch(/migration/i);
    expect(remedy).toContain("capability_grants_capability_chk");
    expect(remedy).toMatch(/refused/i);
  });

  it("names the table when the migration that creates it never ran", () => {
    const err = drizzleQueryError(
      'select 1 from "capability_grants"',
      [],
      postgresError('relation "capability_grants" does not exist', {
        code: "42P01",
        table_name: "capability_grants",
      }),
    );

    expect(dbErrorRemedy(err)).toMatch(/migration/i);
    expect(dbErrorRemedy(err)).toContain("capability_grants");
  });

  it("names the column when only that is missing", () => {
    const err = drizzleQueryError(
      "select merged_into_id from candidate_intake",
      [],
      postgresError('column "merged_into_id" does not exist', {
        code: "42703",
        column_name: "merged_into_id",
      }),
    );

    expect(dbErrorRemedy(err)).toContain("merged_into_id");
    expect(dbErrorRemedy(err)).toMatch(/migration/i);
  });

  it("returns null for anything a migration would not fix", () => {
    // A unique violation is a DATA problem. Telling the reader to run a
    // migration would send them somewhere useless, which is worse than silence.
    const unique = drizzleQueryError(
      "insert into employees (email) values ($1)",
      [],
      postgresError("duplicate key value violates unique constraint", { code: "23505" }),
    );
    expect(dbErrorRemedy(unique)).toBeNull();
    expect(schemaIsBehind(unique)).toBe(false);
  });

  it("does not mistake a Node error code for a SQLSTATE", () => {
    // `ENOENT` and `ECONNREFUSED` are STRINGS. A bare `typeof code === "string"`
    // check would read a dead socket as a schema problem — and a file-not-found
    // as a missing migration. SQLSTATEs are exactly five characters.
    expect(schemaIsBehind(Object.assign(new Error("no such file"), { code: "ENOENT" }))).toBe(false);
    expect(schemaIsBehind(Object.assign(new Error("refused"), { code: "ECONNREFUSED" }))).toBe(false);
    expect(dbErrorRemedy(Object.assign(new Error("bad url"), { code: "ERR_INVALID_URL" }))).toBeNull();
    // …and a numeric code must not qualify either.
    expect(schemaIsBehind(Object.assign(new Error("numeric"), { code: 42_001 }))).toBe(false);
  });

  it("recognises a migration run twice, which is harmless but confusing", () => {
    const twice = drizzleQueryError(
      "create table capability_grants ()",
      [],
      postgresError('relation "capability_grants" already exists', { code: "42P07" }),
    );
    expect(dbErrorRemedy(twice)).toMatch(/already exists/i);
  });
});

describe("dbErrorAdvice — what an administrator is shown", () => {
  it("leads with the remedy for a schema-behind failure", () => {
    const err = drizzleQueryError(
      'insert into "capability_grants" ("id") values (default)',
      [],
      postgresError('violates check constraint "capability_grants_capability_chk"', {
        code: "23514",
        constraint_name: "capability_grants_capability_chk",
      }),
    );

    const advice = dbErrorAdvice(err);
    expect(advice).toMatch(/migration/i);
    expect(advice.startsWith("Failed query")).toBe(false);
  });

  it("NEVER includes bound parameters — the second bug in that message", () => {
    // The params carried an employee's email address, and this string goes into
    // a toast on an admin screen. `dbErrorMessage` deliberately omits them; this
    // asserts the omission survives the new code path too.
    const err = drizzleQueryError(
      'insert into "capability_grants" ("employee_email", "capability") values ($1, $2)',
      ["mansimedhekar.altuscorp@gmail.com", "hr.letters.issue"],
      postgresError('violates check constraint "capability_grants_capability_chk"', {
        code: "23514",
        constraint_name: "capability_grants_capability_chk",
      }),
    );

    expect(dbErrorAdvice(err)).not.toContain("mansimedhekar.altuscorp@gmail.com");
  });

  it("falls back to the cause when there is no remedy to offer", () => {
    const err = drizzleQueryError(
      'delete from "attendance_week_ack"',
      [],
      postgresError('relation "attendance_week_ack" does not exist', { code: "42P01" }),
    );
    // 42P01 HAS a remedy, so this one is the fallback case instead:
    const plain = new Error("fetch failed");
    expect(dbErrorAdvice(plain)).toBe("fetch failed");
    expect(dbErrorAdvice(err)).toMatch(/migration/i);
  });
});
