import { describe, it, expect } from "vitest";
import { dbErrorMessage } from "@/lib/db/error";

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
  fields: { code?: string; detail?: string; hint?: string } = {},
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
