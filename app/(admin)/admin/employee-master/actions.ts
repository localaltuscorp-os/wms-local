"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  employeeCodeRegistry,
  employees,
  salaryCtcBreakup,
  salaryProfiles,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  loadEmployeeMasterDetail,
  type EmployeeMasterDetail,
} from "@/lib/employees/master-query";
import {
  adoptEmployeeCode,
  confirmInternCode,
  issueEmployeeCode,
  previewNextCode,
  retireEmployeeCode,
  suggestPrefixFor,
} from "@/lib/employees/code-registry";
import { parseEmployeeCode } from "@/lib/employees/employee-code";

/**
 * EMPLOYEE MASTER — the actions its workspace calls.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 * Editing identity, department, manager, role and the attendance schedule.
 * Those already have actions — `editEmployee` and
 * `updateEmployeeAttendanceSchedule` in `../employees/actions.ts` — and the
 * workspace calls THOSE. The Employee Master field patch was added to the
 * existing `EditEmployeeSchema` rather than given a second write path, so a
 * saved Entity gets the same validation, the same audit event and the same
 * cache invalidation whichever screen it was typed on. Two writers for one
 * record is the duplication §20 rules out.
 *
 * What is here is the two things that had no action at all: the CTC BREAKUP
 * (§9, component-wise, which nothing could write because `salary_ctc_breakup`
 * was never mapped into Drizzle) and the EMPLOYEE CODE lifecycle.
 *
 * ── AUTHORIZATION ──────────────────────────────────────────────────────────
 * Every export begins with `requireAdmin()`, and the pay ones additionally
 * require super-admin — the same rule the Employees screen already applies to
 * salary. The page hides the Payroll section for a non-super-admin, but that is
 * presentation: these checks are the boundary (§21), and they run whether or
 * not a button was rendered.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read one employee in full — what the workspace opens on. */
export async function fetchEmployeeDetail(
  employeeId: string,
): Promise<EmployeeMasterDetail | null> {
  const me = await requireAdmin();
  if (!UUID.test(employeeId)) return null;

  const detail = await loadEmployeeMasterDetail(employeeId);
  if (!detail) return null;

  // Pay is stripped SERVER-SIDE for a viewer who may not see it, not hidden in
  // the component. A payload that carried the numbers and relied on the client
  // not to render them would put every employee's CTC in the browser of every
  // admin, one devtools tab away.
  if (isSuperAdmin(me.email)) return detail;
  return {
    ...detail,
    row: { ...detail.row, annualCtc: null, monthlyCtc: null, tdsMonthly: null, ptExempt: null },
    ctc: { components: [], annualTotal: 0, monthlyTotal: 0, derivedFromTotalOnly: true },
    onboarding: stripBanking(detail.onboarding),
  };
}

/** Banking and government ids follow pay: super-admins only. */
function stripBanking(f: EmployeeMasterDetail["onboarding"]): EmployeeMasterDetail["onboarding"] {
  const {
    bankAccountName: _a, bankAccountNo: _b, ifsCode: _c, micrCode: _d,
    branchAddress: _e, branchCity: _f, branchPincode: _g, panNo: _h, aadharNo: _i,
    ...rest
  } = f;
  return rest;
}

/* ── CTC ──────────────────────────────────────────────────────────────────── */

export interface CtcComponentInput {
  label: string;
  /** Annual rupees. Monthly is always derived — never sent. */
  annual: number;
}

/**
 * Replace an employee's CTC breakup.
 *
 * ── THE TOTAL AND THE SPLIT ARE TWO DIFFERENT FACTS ────────────────────────
 * `salary_profiles.annual_ctc` is what the SALARY ENGINE reads — it decides
 * what people are paid. `salary_ctc_breakup` is the component split, which
 * nothing computes on. Writing the split must therefore keep the two in step,
 * or a payslip and this screen will quietly disagree about the same person.
 *
 * So the components' sum becomes the new annual CTC on BOTH rows, in one
 * transaction. Passing an empty component list is legitimate — it means "I know
 * the total, not the split" — and then the caller's `annualCtc` stands alone.
 */
export async function saveCtcBreakup(input: {
  employeeId: string;
  annualCtc: number;
  components: CtcComponentInput[];
}): Promise<Result> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin may change salary." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(input.employeeId)) return { ok: false, error: "Invalid employee." };

  const components = (input.components ?? [])
    .map((c) => ({ label: String(c.label ?? "").trim().slice(0, 60), annual: Number(c.annual) }))
    .filter((c) => c.label && Number.isFinite(c.annual) && c.annual >= 0);

  if (components.some((c) => c.annual > 100_000_000)) {
    return { ok: false, error: "A component looks implausibly large. Check the figure." };
  }

  const summed = components.reduce((s, c) => s + c.annual, 0);
  const annual = components.length > 0 ? summed : Number(input.annualCtc);
  if (!Number.isFinite(annual) || annual < 0) {
    return { ok: false, error: "Enter a valid annual CTC." };
  }

  try {
    await db.transaction(async (tx) => {
      // The engine's figure. `onConflictDoUpdate` rather than an update, because
      // an employee with no salary profile yet is a normal state — an intern
      // added this morning has none — and failing to write for that reason
      // would make the field unusable exactly when it is first needed.
      await tx
        .insert(salaryProfiles)
        .values({ employeeId: input.employeeId, annualCtc: String(annual) })
        .onConflictDoUpdate({
          target: salaryProfiles.employeeId,
          set: { annualCtc: String(annual), updatedAt: new Date() },
        });

      await tx
        .insert(salaryCtcBreakup)
        .values({
          employeeId: input.employeeId,
          annualCtc: String(annual),
          components,
          updatedById: me.id,
        })
        .onConflictDoUpdate({
          target: salaryCtcBreakup.employeeId,
          set: { annualCtc: String(annual), components, updatedById: me.id, updatedAt: new Date() },
        });
    });
  } catch (err) {
    return { ok: false, error: `Could not save the CTC: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/admin/employee-master");
  return { ok: true };
}

/** Monthly TDS and the PT exemption — the other two payroll scalars (§9). */
export async function savePayrollScalars(input: {
  employeeId: string;
  tdsMonthly?: number;
  ptExempt?: boolean;
}): Promise<Result> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin may change salary." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(input.employeeId)) return { ok: false, error: "Invalid employee." };

  // SPARSE, like every other patch in this feature: a key that was not sent is
  // left alone. Sending `{}` is a no-op rather than a write of two defaults.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.tdsMonthly !== undefined) {
    const v = Number(input.tdsMonthly);
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: "Enter a valid monthly TDS." };
    set.tdsMonthly = String(v);
  }
  if (input.ptExempt !== undefined) set.ptExempt = !!input.ptExempt;
  if (Object.keys(set).length === 1) return { ok: true };

  try {
    await db
      .insert(salaryProfiles)
      .values({
        employeeId: input.employeeId,
        tdsMonthly: String(input.tdsMonthly ?? 0),
        ptExempt: !!input.ptExempt,
      })
      .onConflictDoUpdate({ target: salaryProfiles.employeeId, set });
  } catch (err) {
    return { ok: false, error: `Could not save: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/admin/employee-master");
  return { ok: true };
}

/* ── Employee codes ───────────────────────────────────────────────────────── */

export async function issueCode(input: {
  employeeId: string;
  prefix: string;
}): Promise<Result<{ code: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(input.employeeId)) return { ok: false, error: "Invalid employee." };

  const res = await issueEmployeeCode({
    employeeId: input.employeeId,
    prefix: input.prefix,
    actorId: me.id,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/employee-master");
  return { ok: true, data: { code: res.code } };
}

/** Backfill a code the company already uses on paper. */
export async function adoptCode(input: {
  employeeId: string;
  code: string;
}): Promise<Result<{ code: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(input.employeeId)) return { ok: false, error: "Invalid employee." };

  const res = await adoptEmployeeCode({ employeeId: input.employeeId, code: input.code, actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/employee-master");
  return { ok: true, data: { code: res.code } };
}

/**
 * Intern → confirmed. Retires the UI-nnn code permanently and issues the next
 * free U-nnn. See `confirmInternCode` for why this is a move and not a rename.
 */
export async function confirmIntern(employeeId: string): Promise<Result<{ code: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(employeeId)) return { ok: false, error: "Invalid employee." };

  const res = await confirmInternCode({ employeeId, actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/employee-master");
  return { ok: true, data: { code: res.code } };
}

/** Retire a code. THE NUMBER IS NOT FREED — see `retireEmployeeCode`. */
export async function retireCode(input: {
  employeeId: string;
  reason: string;
}): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(input.employeeId)) return { ok: false, error: "Invalid employee." };

  const res = await retireEmployeeCode({
    employeeId: input.employeeId,
    actorId: me.id,
    reason: input.reason || "Retired from the Employee Master",
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/employee-master");
  return { ok: true };
}

/**
 * AUTOMATIC CODE ALLOCATION — called after a save that may have changed the
 * employee's entity or designation.
 *
 * ── "PLUG AND PLAY", WITH ONE DELIBERATE STOP ─────────────────────────────
 * The ask: "once when i change the entity or designation it should take it and
 * auto calculate the employee code." For somebody with NO code that is exactly
 * what happens here — set their entity, and the code appears, with the intern
 * series chosen from the designation.
 *
 * For somebody who ALREADY HOLDS a code it stops and asks, because the two
 * scheme rules make an automatic move irreversible:
 *
 *   · issuing the new code RETIRES the old one, and
 *   · a retired number is never reissued — `nextSeq` takes max + 1 and refuses
 *     to fill gaps, because "a gap is somebody who left".
 *
 * So a mis-click on the Entity dropdown would permanently burn a number and
 * silently renumber a real person, with no undo anywhere in the system. This
 * returns a PROPOSAL instead and writes nothing; `applyCodeMove` performs it
 * once somebody has said yes. That is the "auto-issue only for people with no
 * code" behaviour, chosen deliberately over always-reissue.
 *
 * Writes nothing and returns `no_prefix` when the entity carries no letter —
 * The Perfect Blend has none by design, and an entity added later will not
 * either until an administrator assigns one.
 */
export type CodeSyncOutcome =
  /** Issued automatically — they had no code. */
  | { status: "issued"; code: string }
  /** Their code already matches their entity and designation. */
  | { status: "unchanged"; code: string }
  /** A move is proposed and NOT applied. The UI asks first. */
  | { status: "needs_move"; from: string; toPrefix: string; proposedCode: string | null }
  /** The entity has no letter assigned, so no code can be derived. */
  | { status: "no_prefix" }
  /** Nothing to do — no entity set at all. */
  | { status: "no_entity" };

export async function syncEmployeeCode(
  employeeId: string,
): Promise<Result<CodeSyncOutcome>> {
  const me = await requireAdmin();
  if (!UUID.test(employeeId)) return { ok: false, error: "Invalid employee." };

  const [row] = await db
    .select({ entityId: employees.payingEntityId, code: employees.employeeCode })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return { ok: false, error: "Employee not found." };
  if (!row.entityId) return { ok: true, data: { status: "no_entity" } };

  // Entity letter + intern-or-not, from the employee's own record.
  const wanted = await suggestPrefixFor(employeeId);
  if (!wanted) return { ok: true, data: { status: "no_prefix" } };

  const active = await activeCodeFor(employeeId);

  if (!active) {
    const limited = rateLimitOrError(me.id, "write");
    if (limited) return { ok: false, error: limited.error };
    const res = await issueEmployeeCode({ employeeId, prefix: wanted, actorId: me.id });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath("/admin/employee-master");
    return { ok: true, data: { status: "issued", code: res.code } };
  }

  const held = parseEmployeeCode(active.code);
  if (held && held.prefix === wanted) {
    return { ok: true, data: { status: "unchanged", code: active.code } };
  }

  // A move. Proposed, never applied here.
  return {
    ok: true,
    data: {
      status: "needs_move",
      from: active.code,
      toPrefix: wanted,
      proposedCode: await previewNextCode(wanted),
    },
  };
}

/**
 * Apply a move that `syncEmployeeCode` proposed.
 *
 * Re-derives the target prefix server-side rather than trusting one sent by the
 * browser: between the proposal and the click the employee's entity may have
 * been changed again, and a prefix taken from the request would issue a code
 * from a series they are no longer in.
 *
 * The old code is retired permanently by `issueEmployeeCode`, which is the
 * point of asking first.
 */
export async function applyCodeMove(employeeId: string): Promise<Result<{ code: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(employeeId)) return { ok: false, error: "Invalid employee." };

  const wanted = await suggestPrefixFor(employeeId);
  if (!wanted) {
    return { ok: false, error: "That employee's entity has no code letter assigned." };
  }

  const active = await activeCodeFor(employeeId);
  const res = await issueEmployeeCode({
    employeeId,
    prefix: wanted,
    actorId: me.id,
    reason: active
      ? `Entity or designation changed — ${active.code} retired permanently`
      : null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/employee-master");
  return { ok: true, data: { code: res.code } };
}

/** The one code an employee currently holds, if any. */
async function activeCodeFor(employeeId: string): Promise<{ code: string } | null> {
  const [row] = await db
    .select({ code: employeeCodeRegistry.code })
    .from(employeeCodeRegistry)
    .where(
      and(
        eq(employeeCodeRegistry.employeeId, employeeId),
        eq(employeeCodeRegistry.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** What the issue dialog shows before you commit. Advisory, never binding. */
export async function codeSuggestion(employeeId: string): Promise<{
  prefix: string | null;
  nextCode: string | null;
}> {
  await requireAdmin();
  if (!UUID.test(employeeId)) return { prefix: null, nextCode: null };
  const prefix = await suggestPrefixFor(employeeId);
  return { prefix, nextCode: prefix ? await previewNextCode(prefix) : null };
}

/** The letter an entity issues codes under — set once, on the Entities screen. */
export async function setEntityCodePrefix(input: {
  entityId: string;
  prefix: string | null;
}): Promise<Result> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin may change entity code prefixes." };
  }
  if (!UUID.test(input.entityId)) return { ok: false, error: "Invalid entity." };

  const p = input.prefix?.trim().toUpperCase() || null;
  if (p && !/^[A-Z]$/.test(p)) {
    return { ok: false, error: "An entity prefix is a single letter, e.g. A." };
  }

  try {
    await db.execute(
      sql`update paying_entities set code_prefix = ${p} where id = ${input.entityId}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("paying_entities_code_prefix_uq")) {
      return { ok: false, error: `Another entity already issues codes under "${p}".` };
    }
    return { ok: false, error: `Could not save: ${msg}` };
  }
  revalidatePath("/admin/employee-master");
  return { ok: true };
}

/** Used by the workspace's Status row; delegates to the existing lifecycle. */
export async function employeeExists(employeeId: string): Promise<boolean> {
  await requireAdmin();
  if (!UUID.test(employeeId)) return false;
  const row = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { id: true },
  });
  return !!row;
}
