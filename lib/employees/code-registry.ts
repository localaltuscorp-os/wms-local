import "server-only";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeCodeRegistry, employees, payingEntities } from "@/db/schema";
import {
  confirmedPrefix,
  formatEmployeeCode,
  internPrefix,
  isInternPrefix,
  looksLikeInternDesignation,
  nextSeq,
  normalizePrefix,
  parseEmployeeCode,
  suggestPrefix,
} from "./employee-code";

/**
 * EMPLOYEE CODE ALLOCATION — the writes.
 *
 * The rules themselves are pure and live in `./employee-code.ts`; this module
 * is only the part that needs a database. Keeping them apart is what lets the
 * rules — "a number is never reused", "confirmation moves series" — be tested
 * exhaustively without a mock, which matters because a code cannot be
 * un-issued once it is out.
 *
 * ── EVERY ALLOCATION IS SERIALISED ─────────────────────────────────────────
 * `nextSeq` reads a max and then writes max + 1, which is the classic read-
 * modify-write race: two administrators clicking "Issue code" at the same
 * moment both read 106 and both try to write A-107. The advisory lock below
 * serialises allocations PER PREFIX, so they queue rather than collide, and the
 * `employee_code_registry_prefix_seq_uq` index is the backstop if this module
 * is ever bypassed. The lock is per prefix rather than global so issuing a U
 * code never waits on an A code.
 */

export type CodeResult =
  | { ok: true; code: string; prefix: string; seq: number }
  | { ok: false; error: string };

/** The advisory-lock key for one series. Same string ⇒ same lock. */
function prefixLock(prefix: string): string {
  return `employee_code:${prefix.toUpperCase()}`;
}

/**
 * Issue the next code in `prefix` to an employee.
 *
 * Retires whatever code they currently hold first, so the "at most one active
 * code per employee" index is never violated and the old number is never freed.
 * Both happen in ONE transaction: a half-applied issue that retired the old
 * code without writing the new one would leave somebody with no code and a
 * number gone forever.
 */
export async function issueEmployeeCode(input: {
  employeeId: string;
  prefix: string;
  actorId: string;
  /** Why the previous code (if any) is being retired. */
  reason?: string | null;
}): Promise<CodeResult> {
  const prefix = normalizePrefix(input.prefix);
  if (!prefix) {
    return { ok: false, error: "A code prefix is one or two letters, e.g. A or UI." };
  }

  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, input.employeeId),
    columns: { id: true, name: true },
  });
  if (!employee) return { ok: false, error: "Employee not found." };

  try {
    return await db.transaction(async (tx) => {
      // Serialise this series. Transaction-scoped, so it releases on commit or
      // rollback without any unlock call to forget.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefixLock(prefix)}))`);

      // EVERY seq ever issued in this series — retired rows included. That is
      // the retirement rule: see `nextSeq`, which takes max + 1 and never fills
      // a gap, because a gap is somebody who left.
      const rows = await tx
        .select({ seq: employeeCodeRegistry.seq })
        .from(employeeCodeRegistry)
        .where(sql`upper(${employeeCodeRegistry.prefix}) = ${prefix}`);

      const seq = nextSeq(rows.map((r) => r.seq));
      const code = formatEmployeeCode(prefix, seq);
      if (!code) return { ok: false as const, error: "Could not build a code from that prefix." };

      // Retire the current code BEFORE inserting the new one — the partial
      // unique index allows only one active row per employee.
      await tx
        .update(employeeCodeRegistry)
        .set({
          status: "retired",
          retiredAt: new Date(),
          retiredById: input.actorId,
          retiredReason: input.reason ?? "Replaced by a newly issued code",
        })
        .where(
          and(
            eq(employeeCodeRegistry.employeeId, input.employeeId),
            eq(employeeCodeRegistry.status, "active"),
          ),
        );

      await tx.insert(employeeCodeRegistry).values({
        code,
        prefix,
        seq,
        employeeId: input.employeeId,
        employeeName: employee.name,
        status: "active",
        issuedById: input.actorId,
      });

      // The denormalised copy the master table sorts and filters on.
      await tx.update(employees).set({ employeeCode: code }).where(eq(employees.id, input.employeeId));

      return { ok: true as const, code, prefix, seq };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("employee_code_registry_prefix_seq_uq")) {
      // The backstop fired: another transaction took this number between our
      // read and our write. Report the rule rather than the constraint name.
      return { ok: false, error: "That number was just taken. Try again." };
    }
    return { ok: false, error: `Could not issue a code: ${msg}` };
  }
}

/**
 * Retire an employee's code — on exit, archive, or a correction.
 *
 * THE NUMBER IS NOT FREED. The registry row stays, its seq keeps counting
 * toward `nextSeq`, and no future joiner can be given it. That is the entire
 * reason this table exists; a simpler implementation that cleared
 * `employees.employee_code` would hand the number straight back out.
 *
 * `employees.employee_code` IS cleared, because the person no longer holds it.
 * Idempotent: retiring a code twice is a no-op, not an error.
 */
export async function retireEmployeeCode(input: {
  employeeId: string;
  actorId: string;
  reason: string;
}): Promise<{ ok: true; retired: string | null } | { ok: false; error: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: employeeCodeRegistry.id, code: employeeCodeRegistry.code })
        .from(employeeCodeRegistry)
        .where(
          and(
            eq(employeeCodeRegistry.employeeId, input.employeeId),
            eq(employeeCodeRegistry.status, "active"),
          ),
        )
        .limit(1);

      if (!row) return { ok: true as const, retired: null };

      await tx
        .update(employeeCodeRegistry)
        .set({
          status: "retired",
          retiredAt: new Date(),
          retiredById: input.actorId,
          retiredReason: input.reason.trim().slice(0, 500) || "Retired",
        })
        .where(eq(employeeCodeRegistry.id, row.id));

      await tx.update(employees).set({ employeeCode: null }).where(eq(employees.id, input.employeeId));

      return { ok: true as const, retired: row.code };
    });
  } catch (err) {
    return { ok: false, error: `Could not retire the code: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Confirm an intern into a job: UI-101 → the next free U-nnn.
 *
 * ── THIS IS A MOVE, NOT A RENAME, AND THE DIFFERENCE IS THE WHOLE POINT ────
 * "UI will become U — UI will be retired permanently." Read as a rename, that
 * would be `UPDATE … SET code = 'U-101'`, which is wrong twice over: U-101 is
 * already somebody else, and rewriting the row would quietly free the UI number
 * for reissue. So the person is ISSUED the next free number in the entity
 * series and their intern row is RETIRED — two registry rows, both kept, and
 * neither number ever reused.
 *
 * `issueEmployeeCode` already retires the previous active row inside its own
 * transaction, so this is that call with the target series worked out and an
 * accurate reason recorded.
 */
export async function confirmInternCode(input: {
  employeeId: string;
  actorId: string;
}): Promise<CodeResult> {
  const [current] = await db
    .select({ code: employeeCodeRegistry.code, prefix: employeeCodeRegistry.prefix })
    .from(employeeCodeRegistry)
    .where(
      and(
        eq(employeeCodeRegistry.employeeId, input.employeeId),
        eq(employeeCodeRegistry.status, "active"),
      ),
    )
    .limit(1);

  if (!current) {
    return { ok: false, error: "This employee has no active code to convert. Issue one first." };
  }
  if (!isInternPrefix(current.prefix)) {
    return {
      ok: false,
      error: `${current.code} is already on the ${current.prefix} series, not an intern series.`,
    };
  }

  const target = confirmedPrefix(current.prefix);
  if (!target) return { ok: false, error: "Could not work out which series to confirm into." };

  return await issueEmployeeCode({
    employeeId: input.employeeId,
    prefix: target,
    actorId: input.actorId,
    reason: `Confirmed from internship — ${current.code} retired permanently`,
  });
}

/**
 * What code would be issued next, without issuing it. For the form's preview.
 *
 * Advisory: two people watching the same screen see the same answer, and the
 * one who clicks second gets the number after it. The allocation itself is
 * authoritative; this is not.
 */
export async function previewNextCode(prefix: string): Promise<string | null> {
  const p = normalizePrefix(prefix);
  if (!p) return null;
  const rows = await db
    .select({ seq: employeeCodeRegistry.seq })
    .from(employeeCodeRegistry)
    .where(sql`upper(${employeeCodeRegistry.prefix}) = ${p}`);
  return formatEmployeeCode(p, nextSeq(rows.map((r) => r.seq)));
}

/**
 * The prefix to pre-select for an employee, from their entity and designation.
 *
 * A SUGGESTION. Returns null when the entity carries no letter, which is the
 * common case today — most of the roster has no paying entity set — and the
 * form asks rather than guessing. A code cannot be un-issued, so a wrong guess
 * is more expensive than a question.
 */
export async function suggestPrefixFor(employeeId: string): Promise<string | null> {
  const [row] = await db
    .select({
      entityPrefix: payingEntities.codePrefix,
      designation: sql<string | null>`d.name`,
    })
    .from(employees)
    .leftJoin(payingEntities, eq(payingEntities.id, employees.payingEntityId))
    .leftJoin(sql`designations as d`, sql`d.id = ${employees.designationId}`)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!row) return null;
  return suggestPrefix({
    entityCodePrefix: row.entityPrefix,
    isIntern: looksLikeInternDesignation(row.designation),
  });
}

/** Every code an employee has ever held, newest first — the workspace history. */
export async function codeHistoryFor(employeeId: string) {
  return await db
    .select({
      code: employeeCodeRegistry.code,
      status: employeeCodeRegistry.status,
      issuedAt: employeeCodeRegistry.issuedAt,
      retiredAt: employeeCodeRegistry.retiredAt,
      retiredReason: employeeCodeRegistry.retiredReason,
    })
    .from(employeeCodeRegistry)
    .where(eq(employeeCodeRegistry.employeeId, employeeId))
    .orderBy(sql`${employeeCodeRegistry.issuedAt} desc`);
}

/**
 * Adopt a hand-typed code into the registry.
 *
 * For backfilling a roster that already has codes on paper. It refuses anything
 * the allocator could later collide with, and records the row so the number
 * counts toward `nextSeq` from then on — without this, a hand-entered A-106
 * would be invisible to allocation and the next issue would be A-101.
 */
export async function adoptEmployeeCode(input: {
  employeeId: string;
  code: string;
  actorId: string;
}): Promise<CodeResult> {
  const parsed = parseEmployeeCode(input.code);
  if (!parsed) {
    return { ok: false, error: 'A code looks like "A-101" or "UI-103".' };
  }

  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, input.employeeId),
    columns: { id: true, name: true },
  });
  if (!employee) return { ok: false, error: "Employee not found." };

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefixLock(parsed.prefix)}))`);

      // Taken — by anybody, ever, live or retired. The registry is the whole
      // history, so this catches a leaver's number too.
      const [clash] = await tx
        .select({ employeeName: employeeCodeRegistry.employeeName, status: employeeCodeRegistry.status })
        .from(employeeCodeRegistry)
        .where(sql`upper(${employeeCodeRegistry.code}) = ${parsed.code}`)
        .limit(1);
      if (clash) {
        return {
          ok: false as const,
          error:
            clash.status === "retired"
              ? `${parsed.code} was retired and can never be reissued${clash.employeeName ? ` (held by ${clash.employeeName})` : ""}.`
              : `${parsed.code} already belongs to ${clash.employeeName ?? "another employee"}.`,
        };
      }

      await tx
        .update(employeeCodeRegistry)
        .set({
          status: "retired",
          retiredAt: new Date(),
          retiredById: input.actorId,
          retiredReason: "Replaced when an existing code was adopted",
        })
        .where(
          and(
            eq(employeeCodeRegistry.employeeId, input.employeeId),
            eq(employeeCodeRegistry.status, "active"),
          ),
        );

      await tx.insert(employeeCodeRegistry).values({
        code: parsed.code,
        prefix: parsed.prefix,
        seq: parsed.seq,
        employeeId: input.employeeId,
        employeeName: employee.name,
        status: "active",
        issuedById: input.actorId,
      });

      await tx
        .update(employees)
        .set({ employeeCode: parsed.code })
        .where(eq(employees.id, input.employeeId));

      return { ok: true as const, code: parsed.code, prefix: parsed.prefix, seq: parsed.seq };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("_uq")) return { ok: false, error: `${parsed.code} is already taken.` };
    return { ok: false, error: `Could not adopt the code: ${msg}` };
  }
}

/** Used by the master table's "unassigned" filter and the issue dialog. */
export async function countEmployeesWithoutCode(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(sql`${employees.employeeCode} is null`, eq(employees.isActive, true)));
  return r?.n ?? 0;
}

/** Kept exported for the admin screen's "who holds what" view. */
export async function activeCodes() {
  return await db
    .select({
      code: employeeCodeRegistry.code,
      prefix: employeeCodeRegistry.prefix,
      seq: employeeCodeRegistry.seq,
      employeeId: employeeCodeRegistry.employeeId,
      employeeName: employeeCodeRegistry.employeeName,
    })
    .from(employeeCodeRegistry)
    .where(and(eq(employeeCodeRegistry.status, "active"), isNotNull(employeeCodeRegistry.employeeId)))
    .orderBy(employeeCodeRegistry.prefix, employeeCodeRegistry.seq);
}

/** Re-exported so callers need one import for the whole concept. */
export { internPrefix, isInternPrefix, confirmedPrefix, parseEmployeeCode };
