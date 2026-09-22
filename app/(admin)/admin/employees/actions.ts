"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  authSessions,
  departments,
  designations,
  documentEvents,
  employeeDepartments,
  employeeEvents,
  employees,
  functions,
  notifications,
  outstandingFollowups,
  payingEntities,
  salaryProfiles,
  settingsEvents,
  taskEvents,
  tasks,
} from "@/db/schema";
import { payBasisFor } from "@/lib/attendance/worker-type";
import { mergeScheduleForBulk } from "@/lib/employees/bulk-schedule-merge";
// The reporting-line period recorder. `bulkEditEmployees` reaches it too, by
// delegating each row to `editEmployee`, so there is one write path for a
// manager change and not two that could disagree.
import { recordManagerChange, wouldCreateCycle } from "@/lib/employees/manager-history";
import { resolveEmployeeType } from "@/lib/employees/employee-type";
import { requireAdmin } from "@/lib/auth/current";
import { auditLog } from "@/lib/logs/audit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  InviteEmployeeSchema,
  EditEmployeeSchema,
  EmployeeIdSchema,
  ResetPasswordSchema,
  BulkEditEmployeesSchema,
  type InviteEmployeeInput,
  type EditEmployeeInput,
  type BulkEditEmployeesInput,
} from "@/lib/validators/employee";
import {
  UpdateEmployeeSchedule,
  type UpdateEmployeeScheduleInput,
} from "@/lib/validators/attendance";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import {
  sendInviteEmail,
  sendPasswordChangedByAdminEmail,
  sendCredentialsEmail,
} from "@/lib/email/resend";
import { siteUrl, rehostActionLink } from "@/lib/site-url";
import { generateInvitePassword } from "@/lib/auth/default-password";

/**
 * Priv-esc guard: super-admins are ordinary `employees` rows identified by email.
 * A merely-`isAdmin` user must NEVER be able to run a credential/destructive op
 * (reset password, mint invite/reset link, deactivate, delete) against a
 * SUPER-ADMIN — otherwise they could reset the super-admin's password, sign in as
 * them, and seize full control. Returns an error result to short-circuit, or null
 * when the action may proceed.
 */
function guardSuperAdminTarget(
  me: { email: string },
  emp: { email: string },
): { ok: false; error: string } | null {
  if (isSuperAdmin(emp.email) && !isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin can do this to another super-admin." };
  }
  return null;
}

/** Run an async function up to `tries` times with linear backoff. Throws
 *  the last error if all attempts fail. */
async function retry<T>(
  fn: () => Promise<T>,
  { tries, delayMs }: { tries: number; delayMs: number },
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/** Map common firebase-admin auth errors to admin-friendly copy. Returns
 *  null when the error code is unrecognised so the caller can fall back
 *  to the raw message. */
function translateFirebaseAdminError(err: unknown): string | null {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "auth/email-already-exists":
      return "An account already exists with this email in Firebase. Reach out so I can clean up the orphan and retry.";
    case "auth/invalid-email":
      return "That email isn't in a format Firebase accepts.";
    case "auth/user-disabled":
      return "This Firebase account is disabled - reactivate it before inviting again.";
    case "auth/user-not-found":
      return "Firebase doesn't have an account for this email yet.";
    case "auth/insufficient-permission":
      return "The Firebase service account is missing the permissions needed to create users. Check FIREBASE_CLIENT_EMAIL's IAM role.";
    case "auth/internal-error":
      return "Firebase had an internal error. Retry in a few seconds.";
    default:
      return null;
  }
}

/**
 * Resolve a set of department IDs to the valid {id,name} rows that exist,
 * and pick the primary one.  The primary defaults to the first valid id
 * when the requested primary is missing or not part of the set.  Unknown
 * ids are silently dropped.
 */
async function resolveDepartmentSelection(
  departmentIds: string[],
  primaryDepartmentId: string | null | undefined,
): Promise<{
  rows: { id: string; name: string }[];
  primaryId: string | null;
  primaryName: string | null;
}> {
  const unique = [...new Set(departmentIds)];
  if (unique.length === 0) {
    return { rows: [], primaryId: null, primaryName: null };
  }
  const rows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(inArray(departments.id, unique));

  const validIds = new Set(rows.map((r) => r.id));
  const primaryId =
    primaryDepartmentId && validIds.has(primaryDepartmentId)
      ? primaryDepartmentId
      : (rows[0]?.id ?? null);
  const primaryName = rows.find((r) => r.id === primaryId)?.name ?? null;
  return { rows, primaryId, primaryName };
}

/**
 * Replace an employee's department memberships with `rows`, flagging
 * `primaryId` as primary.  Wipe-and-reinsert keeps the logic trivial — the
 * roster is tiny and edits are rare.
 */
async function writeMemberships(
  employeeId: string,
  rows: { id: string }[],
  primaryId: string | null,
): Promise<void> {
  await db
    .delete(employeeDepartments)
    .where(eq(employeeDepartments.employeeId, employeeId));
  if (rows.length > 0) {
    await db.insert(employeeDepartments).values(
      rows.map((r) => ({
        employeeId,
        departmentId: r.id,
        isPrimary: r.id === primaryId,
      })),
    );
  }
}

/**
 * The employee-type flag carried by a designation (0244), or null when there is
 * no designation / it cannot be read.
 *
 * Returns null rather than 'employee' for a MISSING designation so the caller's
 * fallback in `resolveEmployeeType` is the only place that default is written
 * down — two defaults that disagree is how a rule starts drifting.
 */
async function designationTypeFor(designationId: string | null | undefined): Promise<string | null> {
  if (!designationId) return null;
  const [row] = await db
    .select({ employeeType: designations.employeeType })
    .from(designations)
    .where(eq(designations.id, designationId))
    .limit(1);
  return row?.employeeType ?? null;
}

export async function inviteEmployee(input: InviteEmployeeInput): Promise<{
  ok: boolean;
  id?: string;
  /** Set when the row + Firebase user were created OK but the invite email
   *  failed to send. The admin can re-send from the row's overflow menu. */
  warning?: string;
  error?: string;
}> {
  const me = await requireAdmin();

  // safeParse (not parse) — a ZodError thrown here would bubble to the admin
  // error boundary as "We hit a snag." instead of a friendly field message.
  const parsedResult = InviteEmployeeSchema.safeParse(input);
  if (!parsedResult.success) {
    return { ok: false, error: parsedResult.error.issues[0]?.message ?? "Invalid input" };
  }
  const parsed = parsedResult.data;

  // Any admin may create an admin account now (Sir, 2026-08). `requireAdmin`
  // above already guarantees the caller is an admin, and a brand-new row can
  // never be an existing super-admin, so no guardSuperAdminTarget is needed here.

  // Case-insensitive dup check — historical imports may have mixed-case
  // emails even though new ones are normalized by Zod.
  const existing = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${parsed.email}`,
  });
  if (existing) {
    return { ok: false, error: "An employee with this email already exists." };
  }

  /* ── 0244 · EMPLOYEE TYPE, AND THE DATE THE TYPE DECIDES ────────────────
     A new hire who is not an intern must carry a Probation End Date, exactly as
     an edit requires; an intern must carry the start of their internship.

     Checked HERE — before the Firebase account exists — so a refusal leaves
     nothing behind to roll back. Doing it after the createUser call would mean
     an invalid invite produced an orphaned login. */
  const inviteType = resolveEmployeeType({
    override: parsed.employeeType,
    designationType: await designationTypeFor(parsed.designationId),
  });
  const inviteProbationEnd =
    parsed.probationEnd == null || parsed.probationEnd === "" ? null : parsed.probationEnd;
  const inviteInternshipStart =
    parsed.internshipStart == null || parsed.internshipStart === "" ? null : parsed.internshipStart;
  if (inviteType !== "intern" && inviteProbationEnd == null) {
    return { ok: false, error: "Set the Probation End Date before saving this employee." };
  }
  if (inviteType === "intern" && inviteInternshipStart == null) {
    return { ok: false, error: "Set the Internship Start Date for an intern." };
  }

  // 1. Create Firebase user with a fresh per-invite password (same value is
  //    emailed below — no shared default credential).
  const auth = getFirebaseAdminAuth();
  const invitePassword = generateInvitePassword();
  let fbUid: string;
  try {
    const fbUser = await auth.createUser({
      email: parsed.email,
      password: invitePassword,
      emailVerified: true,
      disabled: false,
    });
    fbUid = fbUser.uid;
  } catch (err: any) {
    return {
      ok: false,
      error: translateFirebaseAdminError(err) ?? `Firebase: ${err.message ?? err}`,
    };
  }

  // 2. Set the custom claim required by Supabase Third-Party Auth. Retry
  //    a few times with backoff before giving up — the original "the
  //    Cloud Function will retry" assumption was wrong (no such function
  //    exists in this repo) and a silent failure here locks the user out
  //    of RLS-protected reads.
  try {
    await retry(
      () => auth.setCustomUserClaims(fbUid, { role: "authenticated" }),
      { tries: 3, delayMs: 250 },
    );
  } catch (err) {
    console.error(
      `[inviteEmployee] setCustomUserClaims failed for ${fbUid} - continuing without role claim`,
      err,
    );
  }

  // Resolve the chosen departments + primary so the legacy single-department
  // columns stay in lock-step with the membership join table. Guarded: this
  // runs a DB query AFTER the Firebase user is created, so a throw here (e.g.
  // pool exhaustion) would both surface "We hit a snag." AND orphan the new
  // Firebase account. Roll the account back on failure.
  let selection;
  try {
    selection = await resolveDepartmentSelection(
      parsed.departmentIds,
      parsed.primaryDepartmentId,
    );
  } catch (err) {
    await auth.deleteUser(fbUid).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  // 3. Insert employees row.
  //
  // The pre-check above (line 150) is not race-safe — two admins
  // inviting the same email at the same time both see "no existing
  // row" and both reach this point. The DB-side UNIQUE constraint on
  // `employees.email` is the real arbiter; we catch the violation
  // here and translate Postgres error 23505 into a friendly message
  // instead of leaking "DB: duplicate key value violates …" to the
  // admin. The Firebase user we just created gets rolled back in
  // both cases, so no orphans.
  let inserted;
  try {
    [inserted] = await db.insert(employees).values({
      name:         parsed.name,
      email:        parsed.email,
      role:         parsed.role,
      department:   selection.primaryName,
      departmentId: selection.primaryId,
      isAdmin:      parsed.isAdmin,
      firebaseUid:  fbUid,
      invitedAt:    new Date(),
      designationId: parsed.designationId || null,
      // NULL = follow the designation. Storing "employee" instead would freeze
      // today's designation flag onto the person.
      employeeType: parsed.employeeType || null,
      probationEnd: inviteProbationEnd,
      internshipStart: inviteInternshipStart,
    }).returning();
  } catch (err: unknown) {
    await auth.deleteUser(fbUid).catch(() => {});
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e?.code === "23505") {
      // Could be the email unique-index or (less likely) firebase_uid.
      return {
        ok: false,
        error:
          e.constraint?.includes("firebase_uid")
            ? "An employee is already linked to that Firebase user."
            : "An employee with this email already exists.",
      };
    }
    return { ok: false, error: `DB: ${e?.message ?? String(err)}` };
  }
  if (!inserted) {
    await auth.deleteUser(fbUid).catch(() => {});
    return { ok: false, error: "DB: insert returned no row" };
  }

  // 3b. Record department memberships (many-to-many). Non-fatal: the
  // primary department is already on the employees row, so a failure here
  // only loses secondary memberships, which an admin can re-add.
  try {
    await writeMemberships(inserted.id, selection.rows, selection.primaryId);
  } catch (err) {
    console.error("[inviteEmployee] writeMemberships failed", err);
  }

  // 4. Generate the password-reset (invite) link and email it. We DON'T
  //    roll back the row + Firebase user if the email fails — the admin
  //    can re-send from the row's overflow menu. But we DO surface the
  //    failure to the caller via `warning` so they know to retry.
  let emailWarning: string | undefined;
  try {
    const { error: sendError } = await sendCredentialsEmail({
      email:       parsed.email,
      inviteeName: parsed.name,
      inviterName: me.name,
      password:    invitePassword,
      loginUrl:    `${siteUrl()}/login`,
    });
    if (sendError) {
      emailWarning = `Created the account but the login-details email failed: ${sendError}. Use "Resend invite" to retry.`;
      console.error("[inviteEmployee] sendCredentialsEmail returned error", sendError);
    }
  } catch (err: any) {
    emailWarning = `Created the account but the login-details email failed: ${err?.message ?? err}. Use "Resend invite" to retry.`;
    console.error("[inviteEmployee] sendCredentialsEmail threw", err);
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: inserted.id,
      actorId: me.id,
      eventType: "invited",
      toValue: {
        name: inserted.name,
        email: inserted.email,
        role: inserted.role,
        department: inserted.department,
        isAdmin: inserted.isAdmin,
      },
    });
  } catch (err) {
    console.error("[inviteEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true, id: inserted.id, warning: emailWarning };
}

export async function editEmployee(
  employeeId: string,
  fields: EditEmployeeInput,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();

  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }

  const parsed = EditEmployeeSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Self-demote guard — an admin can't strip their own admin role here.
  // (We don't block other field edits on self; just the role flag.)
  if (
    parsedId.data === me.id &&
    parsed.data.isAdmin === false
  ) {
    return { ok: false, error: "Can't remove your own admin role." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsedId.data),
  });
  if (!emp) return { ok: false, error: "Employee not found" };

  // Any admin may now grant or revoke another employee's admin access (Sir,
  // 2026-08). The one protection kept is the priv-esc guard: a non-super-admin
  // still cannot modify a SUPER-ADMIN's row, so a regular admin can't demote an
  // owner and seize control. A no-op re-save with the same value is unaffected.
  if (parsed.data.isAdmin !== undefined && parsed.data.isAdmin !== emp.isAdmin) {
    const g = guardSuperAdminTarget(me, emp);
    if (g) return g;
  }

  // Build the patch — only include keys that were actually supplied.
  // (Zod's `.optional()` leaves omitted keys absent, so we can safely spread.)
  const patch: Partial<typeof employees.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;

  // Department membership: when `departmentIds` is supplied we replace the
  // whole set and mirror the primary into the legacy single-department
  // columns.  Resolved here; written to the join table after the row update.
  let departmentSelection:
    | Awaited<ReturnType<typeof resolveDepartmentSelection>>
    | null = null;
  if (parsed.data.departmentIds !== undefined) {
    departmentSelection = await resolveDepartmentSelection(
      parsed.data.departmentIds,
      parsed.data.primaryDepartmentId,
    );
    patch.department = departmentSelection.primaryName;
    patch.departmentId = departmentSelection.primaryId;
  }
  if (parsed.data.isAdmin !== undefined) patch.isAdmin = parsed.data.isAdmin;

  if (parsed.data.managerId !== undefined) {
    if (parsed.data.managerId === emp.id) {
      return { ok: false, error: "An employee can't be their own manager." };
    }
    // A CYCLE IS WORSE THAN A WRONG MANAGER. Every downline query in the
    // application is a recursive CTE over `manager_id`; one loop makes goals,
    // productivity, appraisal and the delegated-access hierarchy check either
    // hang or error for everyone in the loop. Self-assignment was already
    // refused above; this catches the two-step version (making your own report
    // your manager), which the old check let straight through.
    if (parsed.data.managerId) {
      if (await wouldCreateCycle(emp.id, parsed.data.managerId)) {
        return {
          ok: false,
          error:
            "That would create a loop in the reporting chain — the chosen manager already reports to this employee.",
        };
      }
    }
    patch.managerId = parsed.data.managerId;
  }

  // #11 — per-employee daily task quota (how many tasks their manager must give).
  if (parsed.data.dailyTaskQuota !== undefined) {
    patch.dailyTaskQuota = parsed.data.dailyTaskQuota;
  }

  // Both numbers normalise an empty string to NULL so "cleared" and "never set"
  // are one state in the database rather than two that render differently.
  if (parsed.data.phone !== undefined) {
    const v = parsed.data.phone;
    patch.phone = v === null || v === "" ? null : v;
  }

  // M4 — multi-channel fields.  WhatsApp phone is normalised to null
  // when empty/null; other flags are passed through verbatim.
  if (parsed.data.whatsappPhone !== undefined) {
    const v = parsed.data.whatsappPhone;
    patch.whatsappPhone = v === null || v === "" ? null : v;
  }
  if (parsed.data.whatsappOptedIn !== undefined) {
    patch.whatsappOptedIn = parsed.data.whatsappOptedIn;
  }
  if (parsed.data.emailOptIn !== undefined) {
    patch.emailOptIn = parsed.data.emailOptIn;
  }
  if (parsed.data.slackOptIn !== undefined) {
    patch.slackOptIn = parsed.data.slackOptIn;
  }
  if (parsed.data.attendanceBiometricExempt !== undefined) {
    patch.attendanceBiometricExempt = parsed.data.attendanceBiometricExempt;
  }

  /* ── EMPLOYEE MASTER (0225) ─────────────────────────────────────────────
     The consolidated master saves through THIS action rather than a second
     one, so these fields get the same validation, the same audit event and the
     same cache invalidation as every other employee edit.

     Each is written only when the key is PRESENT. Absent means "leave it
     alone"; an explicit null means "clear it". Collapsing those two would let
     the workspace blank a field simply by not rendering it, which is exactly
     what the bulk-edit safety note above warns against. */
  const D = parsed.data;
  if (D.functionId !== undefined) patch.functionId = D.functionId;
  if (D.shiftTypeId !== undefined) patch.shiftTypeId = D.shiftTypeId;
  if (D.payingEntityId !== undefined) patch.payingEntityId = D.payingEntityId;
  if (D.designationId !== undefined) patch.designationId = D.designationId;
  if (D.isTeamLead !== undefined) patch.isTeamLead = D.isTeamLead;
  if (D.trainPass !== undefined) patch.trainPass = D.trainPass;
  // Dates arrive as yyyy-mm-dd or "" / null to clear. `joinedAt` is a timestamp
  // column while the other two are `date`, so only it is widened to a Date —
  // handing a bare string to a timestamptz column stores midnight UTC, which
  // reads back a day early east of Greenwich.
  if (D.joinedAt !== undefined) {
    patch.joinedAt = D.joinedAt === null || D.joinedAt === "" ? null : new Date(`${D.joinedAt}T00:00:00+05:30`);
  }
  if (D.probationEnd !== undefined) {
    patch.probationEnd = D.probationEnd === null || D.probationEnd === "" ? null : D.probationEnd;
  }
  /* ── 0244 · EMPLOYEE TYPE AND INTERNSHIP ────────────────────────────────
     `internshipStart` is the only internship column the app ever writes — the
     END date is a generated column in Postgres (start + 6 months), so no code
     can set a pair that disagrees. `employeeType` empty means "follow the
     designation", which is why "" normalises to NULL rather than to "employee":
     writing "employee" would freeze today's designation flag onto the person and
     stop a later designation change from reaching them. */
  if (D.internshipStart !== undefined) {
    patch.internshipStart = D.internshipStart === null || D.internshipStart === "" ? null : D.internshipStart;
  }
  if (D.employeeType !== undefined) {
    patch.employeeType = D.employeeType === null || D.employeeType === "" ? null : D.employeeType;
  }
  if (D.lastWorkingDay !== undefined) {
    patch.lastWorkingDay = D.lastWorkingDay === null || D.lastWorkingDay === "" ? null : D.lastWorkingDay;
  }
  // The two mails. NOTE neither is the LOGIN address (`employees.email`), which
  // is bound to the Firebase account and changes through the invite flow only —
  // editing it here would silently break sign-in.
  if (D.officialEmail !== undefined) {
    const v = D.officialEmail;
    patch.officialEmail = v === null || v === "" ? null : v.toLowerCase();
  }
  if (D.personalEmail !== undefined) {
    const v = D.personalEmail;
    patch.personalEmail = v === null || v === "" ? null : v.toLowerCase();
  }

  /* ── Employee schedule settings (0228) ───────────────────────────────────
     Same `!== undefined` gate as every field above, and for the same reason:
     these arrive from a workspace that renders one section at a time, so a
     section the admin never opened must contribute no keys at all. Writing a
     `false` for an absent boolean would silently switch attendance off for
     somebody who only came in to fix a phone number.

     The two Mon–Fri columns are the SAME ones the Attendance schedule screen
     writes (`updateEmployeeAttendanceSchedule`). That is deliberate: one
     concept, one pair of columns, so the two screens cannot disagree about
     when this person's day starts. `""` clears back to the org default,
     matching how that screen normalises.                                    */
  if (D.attendanceApplicable !== undefined) patch.attendanceApplicable = D.attendanceApplicable;
  if (D.sat1Working !== undefined) patch.sat1Working = D.sat1Working;
  if (D.sat2Working !== undefined) patch.sat2Working = D.sat2Working;
  if (D.sat3Working !== undefined) patch.sat3Working = D.sat3Working;
  if (D.sat4Working !== undefined) patch.sat4Working = D.sat4Working;
  if (D.sat5Working !== undefined) patch.sat5Working = D.sat5Working;
  if (D.wfhFullTimeAllowed !== undefined) patch.wfhFullTimeAllowed = D.wfhFullTimeAllowed;
  if (D.wfhPartTimeAllowed !== undefined) patch.wfhPartTimeAllowed = D.wfhPartTimeAllowed;

  const clock = (v: string | null | undefined) => (v === null || v === "" ? null : v);
  if (D.attOfficialStart !== undefined) patch.attOfficialStart = clock(D.attOfficialStart);
  if (D.attOfficialEnd !== undefined) patch.attOfficialEnd = clock(D.attOfficialEnd);
  if (D.satOfficialStart !== undefined) patch.satOfficialStart = clock(D.satOfficialStart);
  if (D.satOfficialEnd !== undefined) patch.satOfficialEnd = clock(D.satOfficialEnd);

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes to save." };
  }

  /* ── 0244 · PROBATION END DATE IS REQUIRED FOR A NON-INTERN ─────────────
     Enforced HERE, and only here, because every path that changes an employee
     already funnels through this function: the invite, the single edit, the
     bulk edit (which fans out into this per row) and all three UI editors. One
     place to keep right, one message to keep true.

     WHY NOT A NOT NULL COLUMN: two unrelated features read NULL as a real
     state — the leave cycle ("no anchor yet", so a full allowance) and the HR
     confirmation cron ("not scheduled"). Adding NOT NULL would rewrite both.

     WHY IT CAN BREAK A SPARSE PATCH ON PURPOSE: a legacy row with no date is
     refused even when the edit only touched a phone number. That IS the
     requirement ("block the next save until it is provided"), and the three
     editors render the field as required so nobody meets this by surprise.

     The check reads the EFFECTIVE type — the incoming override if this patch
     sets one, else the stored override, else the designation's flag — so an
     intern is exempt and a person whose designation is flagged intern can save
     without one. */
  const effectiveType = resolveEmployeeType({
    override: patch.employeeType !== undefined ? patch.employeeType : emp.employeeType,
    designationType: await designationTypeFor(patch.designationId !== undefined ? patch.designationId : emp.designationId),
  });
  const probationEndAfter = patch.probationEnd !== undefined ? patch.probationEnd : emp.probationEnd;
  if (effectiveType !== "intern" && probationEndAfter == null) {
    return {
      ok: false,
      error: "Set the Probation End Date before saving this employee.",
    };
  }

  try {
    await db.update(employees).set(patch).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  // ── RECORD THE REPORTING-LINE PERIOD (migration 0220) ───────────────────
  // `employees.manager_id` above is still the canonical CURRENT manager and
  // every consumer keeps reading it live. This additionally closes the previous
  // period and opens a new one, so a report about a PAST month is not silently
  // rewritten by a move made today.
  //
  // Not fatal on failure, and deliberately so: the manager change itself has
  // already committed and is what the admin asked for. Losing the history row
  // costs a historical report its precision; refusing the whole edit because a
  // second table was unavailable would cost the company a working org chart.
  if (patch.managerId !== undefined) {
    try {
      await recordManagerChange({
        employeeId: emp.id,
        managerId: (patch.managerId as string | null) ?? null,
        changedById: me.id,
      });
    } catch (err) {
      console.error("[editEmployee] manager history write failed", err);
    }
  }

  // Replace department memberships when the patch touched them.
  if (departmentSelection !== null) {
    try {
      await writeMemberships(
        emp.id,
        departmentSelection.rows,
        departmentSelection.primaryId,
      );
    } catch (err) {
      console.error("[editEmployee] writeMemberships failed", err);
    }
  }

  // NOTE: we deliberately do NOT touch Firebase custom claims when isAdmin
  // changes. The app derives admin status from the employees row, so the
  // claim is incidental — set once on user creation, not on role flips.

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      const next = patch[key];
      const prev = (emp as Record<string, unknown>)[key as string];
      if (prev !== next) {
        fromValue[key as string] = prev ?? null;
        toValue[key as string] = next ?? null;
      }
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId: me.id,
        eventType: "edited",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[editEmployee] audit write failed", err);
  }

  // ── GLOBAL LOGS — field-level before/after, with friendly labels ─────────
  // The employee_events row above is the domain audit (raw from/to); this is the
  // human-readable copy in the global Logs feed. Names for the org-relation ids
  // are resolved so the detail panel reads "Designation: Intern → Associate"
  // rather than two uuids. Non-fatal: a log failure never rolls back the edit.
  try {
    const changedKeys = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== (emp as Record<string, unknown>)[k],
    );
    if (changedKeys.length > 0) {
      const changes = await resolveEmployeeChanges(changedKeys, emp, patch);
      await auditLog({
        eventType: "UPDATE",
        employeeId: me.id,
        route: "/admin/employees",
        module: "Admin Panel",
        page: "Employees",
        resourceType: "employee",
        resourceId: emp.id,
        resourceName: emp.name,
        action: "edit",
        status: "SUCCESS",
        changes,
        sessionCounters: { actions: 1 },
      });
    }
  } catch (err) {
    console.error("[editEmployee] global-log write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

/**
 * Turn a set of changed employee columns into human-readable
 * `[{ field, before, after }]` for the global Logs feed. The org-relation ids
 * (designation, function, entity, manager) are resolved to names; everything
 * else uses a friendly label with its raw value.
 */
async function resolveEmployeeChanges(
  keys: string[],
  emp: typeof employees.$inferSelect,
  patch: Partial<typeof employees.$inferInsert>,
): Promise<{ field: string; before: unknown; after: unknown }[]> {
  const LABELS: Record<string, string> = {
    name: "Name",
    employeeCode: "Employee Code",
    role: "Role",
    isAdmin: "Admin",
    phone: "Phone",
    department: "Function",
    departmentId: "Function",
    designationId: "Designation",
    payingEntityId: "Entity",
    managerId: "Manager",
    probationEnd: "Probation End",
    internshipStart: "Internship Start",
    employeeType: "Employee Type",
    shiftTypeId: "Shift Type",
    weeklyOff: "Weekly Off",
    attendanceApplicable: "Attendance Applicable",
    dailyTaskQuota: "Daily Task Quota",
    worksOutsideOffice: "Works Outside Office",
    email: "Email",
  };

  // Resolve the ids worth naming, in one pass, only for keys that changed.
  const resolveName = async (
    key: string,
    id: string | null | undefined,
  ): Promise<string | null> => {
    if (!id) return null;
    try {
      if (key === "designationId") {
        const r = await db.query.designations.findFirst({
          where: eq(designations.id, id),
          columns: { name: true },
        });
        return r?.name ?? null;
      }
      if (key === "departmentId" || key === "department") {
        const r = await db.query.functions.findFirst({
          where: eq(functions.id, id),
          columns: { name: true },
        });
        return r?.name ?? null;
      }
      if (key === "payingEntityId") {
        const r = await db.query.payingEntities.findFirst({
          where: eq(payingEntities.id, id),
          columns: { name: true },
        });
        return r?.name ?? null;
      }
      if (key === "managerId") {
        const r = await db.query.employees.findFirst({
          where: eq(employees.id, id),
          columns: { name: true },
        });
        return r?.name ?? null;
      }
    } catch {
      return null;
    }
    return null;
  };

  const changes: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    const before = (emp as Record<string, unknown>)[key] ?? null;
    const after = (patch as Record<string, unknown>)[key] ?? null;
    const field = LABELS[key] ?? key;
    const beforeNamed = await resolveName(key, before as string | null | undefined);
    const afterNamed = await resolveName(key, after as string | null | undefined);
    changes.push({
      field,
      before: beforeNamed ?? before,
      after: afterNamed ?? after,
    });
  }
  return changes;
}

/**
 * Set an employee's attendance schedule (Task A5): their weekly-off day plus
 * the four optional time overrides. An empty-string / null override CLEARS the
 * column back to the company default. Admin-only. Audited; revalidates the
 * employees + attendance-dashboard surfaces.
 */
export async function updateEmployeeAttendanceSchedule(
  input: UpdateEmployeeScheduleInput,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();

  const parsed = UpdateEmployeeSchedule.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsed.data.employeeId),
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  // Normalise "" → null so a cleared override falls back to the org default.
  const norm = (v: string | null | undefined): string | null =>
    v == null || v === "" ? null : v;

  const patch: Record<string, unknown> = {
    weeklyOff: parsed.data.weeklyOff,
    attOfficialStart: norm(parsed.data.attOfficialStart),
    attLateAfter: norm(parsed.data.attLateAfter),
    attOfficialEnd: norm(parsed.data.attOfficialEnd),
    attEarlyBefore: norm(parsed.data.attEarlyBefore),
  };

  // Worker classification + minute overrides (only when the client sent them).
  if (parsed.data.workerType !== undefined) patch.workerType = parsed.data.workerType;
  if (parsed.data.attFullDayMinutes !== undefined) {
    patch.attFullDayMinutes = parsed.data.attFullDayMinutes;
  }
  if (parsed.data.attHalfDayMinutes !== undefined) {
    patch.attHalfDayMinutes = parsed.data.attHalfDayMinutes;
  }
  if (parsed.data.weeklyTargetMinutes !== undefined) {
    patch.weeklyTargetMinutes = parsed.data.weeklyTargetMinutes;
  }

  try {
    await db.update(employees).set(patch).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err?.message ?? err}` };
  }

  // Upsert the pay profile when a worker type was chosen. `pay_type` is derived
  // from the worker type (never hand-set); the rate columns are numeric, so we
  // stringify. salary_profiles has a UNIQUE(employee_id), so onConflict updates
  // in place and leaves annual_ctc / tds / pt_exempt untouched.
  if (parsed.data.workerType !== undefined) {
    const payType = payBasisFor(parsed.data.workerType);
    const numStr = (v: number | null | undefined): string | null =>
      v == null ? null : String(v);
    const monthlyPayAtTarget = numStr(parsed.data.monthlyPayAtTarget);
    const weeklyTargetHours = numStr(parsed.data.weeklyTargetHours);
    const monthlyFee = numStr(parsed.data.monthlyFee);
    try {
      await db
        .insert(salaryProfiles)
        .values({
          employeeId: emp.id,
          payType,
          monthlyPayAtTarget,
          weeklyTargetHours,
          monthlyFee,
        })
        .onConflictDoUpdate({
          target: salaryProfiles.employeeId,
          set: {
            payType,
            monthlyPayAtTarget,
            weeklyTargetHours,
            monthlyFee,
            updatedAt: new Date(),
          },
        });
    } catch (err: any) {
      return { ok: false, error: `DB: ${err?.message ?? err}` };
    }
  }

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      const prev = (emp as Record<string, unknown>)[key as string] ?? null;
      const next = patch[key] ?? null;
      if (prev !== next) {
        fromValue[key as string] = prev;
        toValue[key as string] = next;
      }
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId: me.id,
        eventType: "edited",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateEmployeeAttendanceSchedule] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  revalidatePath("/attendance/dashboard");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

/**
 * Generate the Firebase password-reset link for an existing employee
 * and return it so the admin can ship it manually (DM / WhatsApp /
 * paste-into-an-email-they-control). This is the bypass for when
 * Resend is down or the recipient's domain isn't on Resend's verified
 * sender list yet.
 *
 * Does NOT touch the employees row, does NOT log an audit event — it's
 * a read-only credential-handoff. Admin-only. Returns the link as a
 * raw string so the client can drop it on the clipboard.
 */
export async function getInviteLink(
  employeeId: string,
): Promise<{ ok: boolean; link?: string; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: parsedId.error.issues[0]?.message ?? "Invalid employee id",
    };
  }
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsedId.data),
  });
  if (!emp) return { ok: false, error: "Employee not found." };
  const saGuard = guardSuperAdminTarget(me, emp);
  if (saGuard) return saGuard;
  if (!emp.isActive) {
    return { ok: false, error: "Employee is deactivated - reactivate first." };
  }
  if (!emp.firebaseUid) {
    return {
      ok: false,
      error: "This employee has no Firebase account yet - contact support.",
    };
  }
  try {
    const link = rehostActionLink(
      await getFirebaseAdminAuth().generatePasswordResetLink(
        emp.email,
        { url: `${siteUrl()}/welcome?intent=invite` },
      ),
    );
    return { ok: true, link };
  } catch (err: any) {
    return {
      ok: false,
      error:
        translateFirebaseAdminError(err) ??
        (err?.message ?? String(err)),
    };
  }
}

export async function resendInvite(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (emp.joinedAt !== null) return { ok: false, error: "Employee has already joined." };
  if (!emp.firebaseUid) return { ok: false, error: "This employee has no Firebase account yet." };
  try {
    // Per-invite passwords aren't stored, so to resend we mint a FRESH one and
    // reset it on the Firebase user. Safe because this is gated on not-yet-
    // joined (the invitee never signed in / set their own password).
    const newPassword = generateInvitePassword();
    await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { password: newPassword });
    const { error } = await sendCredentialsEmail({
      email:       emp.email,
      inviteeName: emp.name,
      inviterName: me.name,
      password:    newPassword,
      loginUrl:    `${siteUrl()}/login`,
    });
    if (error) return { ok: false, error };
  } catch (err: any) {
    return { ok: false, error: translateFirebaseAdminError(err) ?? (err.message ?? String(err)) };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "invite_resent",
    });
  } catch (err) {
    console.error("[resendInvite] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

/**
 * Admin-driven password reset. Sets a new Firebase password, revokes the
 * employee's refresh tokens + tracked sessions (signing them out everywhere),
 * stamps `password_reset_by_admin_at` so a stale-password sign-in shows the
 * "changed by admin" message, emails the employee (best-effort), and audits.
 * Never logs the password. Admin-only; cannot target self.
 */
export async function resetEmployeePassword(
  employeeId: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const me = await requireAdmin();

  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const parsedPw = ResetPasswordSchema.safeParse({ password: newPassword });
  if (!parsedPw.success) {
    return { ok: false, error: parsedPw.error.issues[0]?.message ?? "Invalid password" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't reset your own password here - use Forgot password." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsedId.data),
  });
  if (!emp) return { ok: false, error: "Employee not found." };
  const saGuard = guardSuperAdminTarget(me, emp);
  if (saGuard) return saGuard;
  if (!emp.isActive) return { ok: false, error: "Employee is deactivated - reactivate first." };
  if (!emp.firebaseUid) {
    return { ok: false, error: "This employee has no Firebase account yet - contact support." };
  }

  // 1-2. Firebase: set password + revoke tokens (sign-out everywhere).
  try {
    const auth = getFirebaseAdminAuth();
    await auth.updateUser(emp.firebaseUid, { password: parsedPw.data.password });
    await auth.revokeRefreshTokens(emp.firebaseUid);
  } catch (err: any) {
    return { ok: false, error: translateFirebaseAdminError(err) ?? (err?.message ?? String(err)) };
  }

  // 3. Drop tracked sessions so logged-in devices are bounced on next request.
  try {
    await db.delete(authSessions).where(eq(authSessions.employeeId, emp.id));
  } catch (err) {
    console.error("[resetEmployeePassword] auth_sessions delete failed", err);
  }

  // 4. Stamp the lockout marker.
  try {
    await db
      .update(employees)
      .set({ passwordResetByAdminAt: new Date() })
      .where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err?.message ?? err}` };
  }

  // 5. Email the employee (best-effort — never blocks the reset).
  let warning: string | undefined;
  try {
    const { error } = await sendPasswordChangedByAdminEmail({
      email: emp.email,
      recipientName: emp.name,
    });
    if (error) warning = `Password reset, but the email couldn't be sent: ${error}`;
  } catch (err) {
    console.error("[resetEmployeePassword] email send threw", err);
    warning = "Password reset, but the notification email failed to send.";
  }

  // 6. Audit (no password). Non-fatal.
  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "password_reset_by_admin",
    });
  } catch (err) {
    console.error("[resetEmployeePassword] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true, warning };
}

export async function deactivateEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  const saGuard = guardSuperAdminTarget(me, emp);
  if (saGuard) return saGuard;
  if (!emp.isActive) return { ok: false, error: "Employee is already deactivated." };

  try {
    await db.update(employees).set({ isActive: false }).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  if (emp.firebaseUid) {
    try {
      await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { disabled: true });
    } catch (err: any) {
      // Roll back the DB update so the two systems stay in sync.
      await db
        .update(employees)
        .set({ isActive: true })
        .where(eq(employees.id, emp.id))
        .catch(() => {});
      return { ok: false, error: `Firebase: ${err.message ?? err}` };
    }
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "deactivated",
      fromValue: { isActive: true },
      toValue: { isActive: false },
    });
  } catch (err) {
    console.error("[deactivateEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

export async function reactivateEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (emp.isActive) return { ok: false, error: "Employee is already active." };

  try {
    await db.update(employees).set({ isActive: true }).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  if (emp.firebaseUid) {
    try {
      await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { disabled: false });
    } catch (err: any) {
      await db
        .update(employees)
        .set({ isActive: false })
        .where(eq(employees.id, emp.id))
        .catch(() => {});
      return { ok: false, error: `Firebase: ${err.message ?? err}` };
    }
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "reactivated",
      fromValue: { isActive: false },
      toValue: { isActive: true },
    });
  } catch (err) {
    console.error("[reactivateEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hard delete (admin power tool)
//
// Permanently removes the employees row, the Firebase user, and every row
// that referenced them as doer/initiator/creator/actor. Audit history about
// those tasks is destroyed by design — this is the GDPR right-to-erasure
// shape, NOT the deactivate flow. The deletion itself is logged to
// settings_events under the *deleting admin's* actor_id so the act of
// erasure is preserved even though the erased identity is gone.
//
// Order matters because the schema's RESTRICT FKs block several paths:
//   1. settings_events.actor_id  (RESTRICT)
//   2. employee_events.actor_id  (RESTRICT — employee_id cascades from step 5)
//   3. task_events.actor_id      (RESTRICT — task_id cascades from step 4)
//   4. tasks owned by them       (RESTRICT chain on doer / initiator / created_by)
//   5. employees row             (cascades notifications, push_subs, their own
//                                  lifecycle employee_events)
//   6. Firebase user
// ---------------------------------------------------------------------------

export interface EmployeeDeletionImpact {
  ok: boolean;
  error?: string;
  /** Tasks where this employee is doer / initiator / creator — all deleted. */
  tasks: number;
  /** task_events authored by this employee — deleted. */
  taskEventsAsActor: number;
  /** employee_events lifecycle entries ABOUT them — cascaded. */
  employeeEventsAboutThem: number;
  /** employee_events authored by them — deleted. */
  employeeEventsAsActor: number;
  /** settings_events authored by them — deleted. */
  settingsEventsAsActor: number;
  /** Their own inbox notifications — cascaded. */
  notifications: number;
}

/**
 * Counts what `deleteEmployee` would destroy. Admin-only. Pure read; no
 * mutations. Use this to populate the confirmation dialog before the
 * destructive call lands.
 */
export async function getEmployeeDeletionImpact(
  employeeId: string,
): Promise<EmployeeDeletionImpact> {
  await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: parsedId.error.issues[0]?.message ?? "Invalid employee id",
      tasks: 0,
      taskEventsAsActor: 0,
      employeeEventsAboutThem: 0,
      employeeEventsAsActor: 0,
      settingsEventsAsActor: 0,
      notifications: 0,
    };
  }
  const id = parsedId.data;

  const [[t], [te], [eeAbout], [eeActor], [se], [n]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        or(
          eq(tasks.doerId, id),
          eq(tasks.initiatorId, id),
          eq(tasks.createdById, id),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskEvents)
      .where(eq(taskEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employeeEvents)
      .where(eq(employeeEvents.employeeId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employeeEvents)
      .where(eq(employeeEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(settingsEvents)
      .where(eq(settingsEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.userId, id)),
  ]);

  return {
    ok: true,
    tasks: Number(t?.n ?? 0),
    taskEventsAsActor: Number(te?.n ?? 0),
    employeeEventsAboutThem: Number(eeAbout?.n ?? 0),
    employeeEventsAsActor: Number(eeActor?.n ?? 0),
    settingsEventsAsActor: Number(se?.n ?? 0),
    notifications: Number(n?.n ?? 0),
  };
}

/**
 * Hard-delete an employee and every row that depended on them. Requires the
 * admin to pass `confirmationEmail` exactly equal to the target's email —
 * client-side belt + server-side suspenders for "I really mean it".
 *
 * Returns the destruction counts on success so the caller can surface a
 * confirmation toast ("Deleted Hetesh — 12 tasks, 47 events").
 */
export async function deleteEmployee(
  employeeId: string,
  confirmationEmail: string,
): Promise<{
  ok: boolean;
  error?: string;
  deleted?: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };
}> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't delete your own account." };
  }
  const id = parsedId.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!emp) return { ok: false, error: "Employee not found." };
  const saGuard = guardSuperAdminTarget(me, emp);
  if (saGuard) return saGuard;

  if (
    typeof confirmationEmail !== "string" ||
    confirmationEmail.trim().toLowerCase() !== emp.email.toLowerCase()
  ) {
    return { ok: false, error: "Confirmation email does not match." };
  }

  // Snapshot identity BEFORE we wipe the row so we can audit the deletion.
  const snapshot = {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role,
    department: emp.department,
    firebaseUid: emp.firebaseUid,
  };

  let counts: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };

  try {
    counts = await db.transaction(async (tx) => {
      // 1. settings_events authored by them — RESTRICT, must precede employees.
      const seDeleted = await tx
        .delete(settingsEvents)
        .where(eq(settingsEvents.actorId, id))
        .returning({ id: settingsEvents.id });

      // 2. employee_events where they're the actor — RESTRICT. The lifecycle
      //    entries ABOUT them (employee_id = id) cascade with step 5.
      const eeDeleted = await tx
        .delete(employeeEvents)
        .where(eq(employeeEvents.actorId, id))
        .returning({ id: employeeEvents.id });

      // 3. task_events authored by them — RESTRICT. Events tied to tasks we
      //    delete in step 4 cascade automatically (task_events.task_id is
      //    ON DELETE CASCADE), so this only catches events on OTHER tasks.
      const teDeleted = await tx
        .delete(taskEvents)
        .where(eq(taskEvents.actorId, id))
        .returning({ id: taskEvents.id });

      // 4. tasks owned by them (RESTRICT chain) — cascades their remaining
      //    task_events and notifications-with-this-task_id.
      const tDeleted = await tx
        .delete(tasks)
        .where(
          or(
            eq(tasks.doerId, id),
            eq(tasks.initiatorId, id),
            eq(tasks.createdById, id),
          ),
        )
        .returning({ id: tasks.id });

      // 4b. document_events + outstanding_followups authored by them — both
      //     RESTRICT (schema.ts:764, 1152). Without these the whole delete
      //     fails with a raw FK error for anyone who ever touched a document
      //     or a collection follow-up, so the button was permanently broken.
      await tx.delete(documentEvents).where(eq(documentEvents.actorId, id));
      await tx
        .delete(outstandingFollowups)
        .where(eq(outstandingFollowups.actorId, id));

      // 5. The employees row itself. Cascades:
      //    - notifications WHERE user_id = id  (their inbox)
      //    - push_subscriptions WHERE user_id = id
      //    - employee_events WHERE employee_id = id  (lifecycle about-them)
      await tx.delete(employees).where(eq(employees.id, id));

      return {
        tasks: tDeleted.length,
        taskEvents: teDeleted.length,
        employeeEvents: eeDeleted.length,
        settingsEvents: seDeleted.length,
      };
    });
  } catch (err: any) {
    // Drizzle wraps EVERY query failure in a DrizzleQueryError whose `.message`
    // is always "Failed query: <sql> params: …" — the real Postgres error
    // (constraint name, detail, hint) sits on `.cause`. Reading only `.message`
    // made the toast identical for every possible failure at this step, which is
    // why a failing delete here was undiagnosable from the UI. Prefer the cause.
    const cause = err?.cause;
    const detail =
      [cause?.message, cause?.detail, cause?.constraint_name ?? cause?.constraint]
        .filter(Boolean)
        .join(" — ") || null;
    console.error("[deleteEmployee] transaction failed", cause ?? err);
    return { ok: false, error: `DB: ${detail ?? err?.message ?? err}` };
  }

  // 6. Firebase user. Best-effort — the DB is already consistent, so a
  //    Firebase failure leaves at most an orphan disabled account.
  if (snapshot.firebaseUid) {
    try {
      await getFirebaseAdminAuth().deleteUser(snapshot.firebaseUid);
    } catch (err) {
      console.warn(
        `[deleteEmployee] firebase deleteUser(${snapshot.firebaseUid}) failed - clean up manually`,
        err,
      );
    }
  }

  // 7. Audit the erasure itself under the deleting admin's actor_id. Scoped
  //    to "employees" + the deleted id so /admin/activity can surface it
  //    alongside other employee-scoped events.
  try {
    await db.insert(settingsEvents).values({
      scope: "employees",
      targetId: snapshot.id,
      actorId: me.id,
      eventType: "employee_deleted",
      fromValue: snapshot,
      toValue: counts,
    });
  } catch (err) {
    console.error("[deleteEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true, deleted: counts };
}

/** One employee that could not be updated, so the admin can see WHO failed. */
export interface BulkEditFailure {
  id: string;
  name: string;
  error: string;
}

/**
 * "Edit All" — apply a SPARSE patch to many employees at once.
 *
 * ── THE ONE RULE: ONLY WHAT CHANGED ────────────────────────────────────────
 * Absent key = leave that field exactly as it is, per employee. This matters
 * more than it looks, because `updateEmployeeAttendanceSchedule` is NOT sparse:
 * it always writes weeklyOff and all four time columns, and it re-derives the
 * salary_profiles rates from whatever it was handed. Calling it with only a
 * worker type would therefore blank every other schedule field and wipe the pay
 * rates for every selected person.
 *
 * So the merge happens HERE: for each employee we read their CURRENT row (and
 * pay profile), overlay only the keys the admin actually touched, and hand the
 * existing action a COMPLETE input. Same code path, same validation, same audit
 * events, same cache invalidation as editing one person — this action adds a
 * loop and a merge, and changes no business logic.
 *
 * ── PER-EMPLOYEE ISOLATION ─────────────────────────────────────────────────
 * Each employee is attempted independently and failures are collected, not
 * thrown. One person who trips a guard (the self-demote rule, a stale id) must
 * not silently abort the other 24 — the caller gets counts plus the failed rows
 * by name so a partial apply is visible rather than mysterious.
 *
 * Admin-only: the underlying actions each call `requireAdmin` themselves; the
 * check here fails fast before any work starts.
 */
export async function bulkEditEmployees(
  employeeIds: string[],
  patch: BulkEditEmployeesInput,
): Promise<{
  ok: boolean;
  updated: number;
  failed: BulkEditFailure[];
  error?: string;
}> {
  await requireAdmin();

  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false, updated: 0, failed: [], error: "No employees selected." };
  }
  for (const id of ids) {
    if (!EmployeeIdSchema.safeParse(id).success) {
      return { ok: false, updated: 0, failed: [], error: "Invalid employee id." };
    }
  }

  const parsed = BulkEditEmployeesSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      updated: 0,
      failed: [],
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const p = parsed.data;

  // Which halves of the patch were touched at all. An untouched half means that
  // action is never called, so it cannot write anything.
  const identityKeys = [
    "role",
    "departmentIds",
    "primaryDepartmentId",
    "managerId",
    "dailyTaskQuota",
    "whatsappOptedIn",
    // Employee Master (0225). MUST be listed here: `touchesIdentity` is what
    // decides whether `editEmployee` is called at all, so a patch that changed
    // only, say, Entity would otherwise be computed, validated — and silently
    // dropped without a single write.
    "functionId",
    "shiftTypeId",
    "payingEntityId",
    "designationId",
    "isTeamLead",
    "trainPass",
    "joinedAt",
    "probationEnd",
    // 0244 — internship start (the end is generated) and the employee-type
    // override. Listed for the reason above: a patch that only set one of these
    // would otherwise be dropped without a write.
    "internshipStart",
    "employeeType",
    "lastWorkingDay",
  ] as const;
  const scheduleKeys = [
    "workerType",
    "weeklyOff",
    "attOfficialStart",
    "attLateAfter",
    "attOfficialEnd",
    "attEarlyBefore",
  ] as const;
  const touchesIdentity = identityKeys.some((k) => p[k] !== undefined);
  const touchesSchedule = scheduleKeys.some((k) => p[k] !== undefined);

  const rows = await db.select().from(employees).where(inArray(employees.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Pay rates are read once and handed straight back, so a worker-type change
  // cannot null out someone's rupee figures as a side effect.
  const profileRows = touchesSchedule
    ? await db
        .select({
          employeeId: salaryProfiles.employeeId,
          monthlyPayAtTarget: salaryProfiles.monthlyPayAtTarget,
          weeklyTargetHours: salaryProfiles.weeklyTargetHours,
          monthlyFee: salaryProfiles.monthlyFee,
        })
        .from(salaryProfiles)
        .where(inArray(salaryProfiles.employeeId, ids))
    : [];
  const profileById = new Map(profileRows.map((r) => [r.employeeId, r]));

  const failed: BulkEditFailure[] = [];
  let updated = 0;

  for (const id of ids) {
    const emp = byId.get(id);
    if (!emp) {
      failed.push({ id, name: id, error: "Employee not found." });
      continue;
    }
    let touched = false;

    if (touchesIdentity) {
      const fields: EditEmployeeInput = {};
      if (p.role !== undefined) fields.role = p.role;
      if (p.managerId !== undefined) {
        // Never make someone their own manager just because they were in the
        // selection: skip the key for that one person, keep the rest of the patch.
        if (p.managerId !== id) fields.managerId = p.managerId;
      }
      if (p.dailyTaskQuota !== undefined) fields.dailyTaskQuota = p.dailyTaskQuota;
      if (p.whatsappOptedIn !== undefined) fields.whatsappOptedIn = p.whatsappOptedIn;
      if (p.departmentIds !== undefined) {
        fields.departmentIds = p.departmentIds;
        fields.primaryDepartmentId = p.primaryDepartmentId ?? null;
      }
      // Employee Master fields (0225). Forwarded key by key, and ONLY when the
      // key is present — the bulk editor omits anything left on "No change", so
      // an unchecked Function must arrive here as `undefined` and never as null.
      // Copying the whole patch object across would turn every untouched field
      // into an explicit null and blank the roster.
      if (p.functionId !== undefined) fields.functionId = p.functionId;
      if (p.shiftTypeId !== undefined) fields.shiftTypeId = p.shiftTypeId;
      if (p.payingEntityId !== undefined) fields.payingEntityId = p.payingEntityId;
      if (p.designationId !== undefined) fields.designationId = p.designationId;
      if (p.isTeamLead !== undefined) fields.isTeamLead = p.isTeamLead;
      if (p.trainPass !== undefined) fields.trainPass = p.trainPass;
      if (p.joinedAt !== undefined) fields.joinedAt = p.joinedAt;
      if (p.probationEnd !== undefined) fields.probationEnd = p.probationEnd;
      if (p.lastWorkingDay !== undefined) fields.lastWorkingDay = p.lastWorkingDay;
      if (Object.keys(fields).length > 0) {
        const res = await editEmployee(id, fields);
        if (!res.ok) {
          failed.push({ id, name: emp.name, error: res.error ?? "Update failed." });
          continue;
        }
        touched = true;
      }
    }

    if (touchesSchedule) {
      // The merge that keeps untouched fields untouched lives in
      // lib/employees/bulk-schedule-merge.ts — pure, and unit-tested there.
      const input: UpdateEmployeeScheduleInput = mergeScheduleForBulk(
        id,
        emp,
        profileById.get(id),
        p,
      );
      const res = await updateEmployeeAttendanceSchedule(input);
      if (!res.ok) {
        failed.push({ id, name: emp.name, error: res.error ?? "Schedule update failed." });
        continue;
      }
      touched = true;
    }

    if (touched) updated++;
  }

  revalidatePath("/admin/employees");
  revalidatePath("/attendance/dashboard");
  updateTag(CACHE_TAGS.employees);
  return { ok: failed.length === 0, updated, failed };
}
