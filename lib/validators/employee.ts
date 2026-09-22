import { z } from "zod";
import { EMPLOYEE_TYPES, WORKER_TYPES } from "@/db/enums";

/** HH:mm, matching lib/validators/attendance.ts — the schedule columns are
 *  written by both this bulk patch and the single-employee schedule action. */
const TIME_HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm");

/**
 * yyyy-mm-dd, AND A REAL CALENDAR DAY. Declared here, above the schemas that
 * use it, because the invite schema needs it too (0244 added Probation End Date
 * and Internship Start Date to it).
 *
 * The regex alone accepts 31 Feb — it was the only check until 0244, and every
 * `date` column was relying on Postgres to refuse the rest. That works, but it
 * reports the failure as a driver error on save rather than as a message beside
 * the field, so the day is verified here too. Same rule, and the same reasoning,
 * as `isIsoDate` in lib/incentive/master.ts: round-tripping through Date is what
 * rejects 2026-02-31 (which JS would otherwise roll forward to 3 March).
 */
const ISO_DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use a date like 2026-04-01")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "That date does not exist.");

/**
 * Normalize a name string before validation/storage:
 *  - rewrite literal backslash-escape sequences (\n / \t / \r) that snuck
 *    in from shell-mangled CLI args into a single space,
 *  - collapse any run of whitespace (including real newlines/tabs) into
 *    one space,
 *  - trim ends.
 *
 * Prevents data like "hetesh      \n  vichare" from ever reaching the
 * employees table again. Does NOT title-case — names like "van der Berg"
 * or "McConnell" need user judgment, not automation.
 */
export function normalizeName(raw: string): string {
  return raw
    .replace(/\\[ntr]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const nameField = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, "Name is required").max(120));

/** A set of department IDs a person belongs to (many-to-many). */
const departmentIdsField = z.array(z.string().uuid()).default([]);
/** Which of the chosen departments is the primary one (mirrored to the
 *  legacy single-department columns). Null = no primary / no departments. */
const primaryDepartmentIdField = z.string().uuid().nullable().optional();

export const InviteEmployeeSchema = z.object({
  name:        nameField,
  email:       z.string().trim().toLowerCase().email("Invalid email"),
  role:        z.enum(["doer", "initiator", "both"]),
  departmentIds:        departmentIdsField,
  primaryDepartmentId:  primaryDepartmentIdField,
  isAdmin:     z.boolean().default(false),
  /**
   * 0244 — WHICH DESIGNATION, AND THEREFORE WHICH EMPLOYEE TYPE.
   *
   * The invite form had neither. Without a designation there is no way to know
   * whether the new person is an employee (who needs a Probation End Date) or an
   * intern (who needs an internship instead), so the required-probation rule
   * could not be expressed for a NEW hire at all. Adding the picker is what
   * makes the rule applicable at creation, not only on a later edit.
   */
  designationId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  /** The per-person override. Absent/empty = follow the designation. */
  employeeType: z.union([z.enum(EMPLOYEE_TYPES), z.literal(""), z.null()]).optional(),
  /** Required for a non-intern — checked in `inviteEmployee`, which is where the
   *  effective type is known (the schema cannot read the designation's flag). */
  probationEnd: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
  /** Interns: the start date. The END date is computed by the database. */
  internshipStart: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
});

export type InviteEmployeeInput = z.infer<typeof InviteEmployeeSchema>;

export const EmployeeIdSchema = z.string().uuid("Invalid employee id");

/**
 * Validates a new password for the admin-driven reset flow. Firebase
 * requires >= 6 chars; we require 8 for a sane floor. Upper bound guards
 * against absurd inputs. No complexity rule here — the Generate button
 * produces strong passwords; manual entry is the admin's call.
 */
export const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

/**
 * Patch-shaped schema for `editEmployee`. Every field is optional and only
 * supplied keys are written. `email` and `firebase_uid` are intentionally
 * absent — those are immutable identity. Reject empty patches so callers
 * don't burn a round-trip on a no-op.
 */
export const EditEmployeeSchema = z
  .object({
    name:       z
      .string()
      .transform(normalizeName)
      .pipe(z.string().min(1, "Name is required").max(80))
      .optional(),
    role:       z.enum(["doer", "initiator", "both"]).optional(),
    // Department membership patch: when `departmentIds` is supplied the
    // whole membership set is replaced.  `primaryDepartmentId` marks which
    // one mirrors to the legacy single-department columns.
    departmentIds:        z.array(z.string().uuid()).optional(),
    primaryDepartmentId:  z.string().uuid().nullable().optional(),
    managerId:  z.string().uuid().nullable().optional(),
    dailyTaskQuota: z.coerce.number().int().min(0).max(50).optional(),
    isAdmin:    z.boolean().optional(),
    // MASTER ADMIN — may rewrite the permission matrix. NOT a column on
    // `employees`: it is a row in `capability_grants` (migration 0226), so this
    // field is a REQUEST to change that grant rather than a value to write
    // alongside the other columns. `editEmployee` applies it first and refuses
    // unless the caller is a super-admin.
    //
    // Deliberately absent from BulkEditEmployeesSchema below: that patch is
    // built key-by-key and must never carry a privilege change, for the same
    // reason it has never carried `isAdmin`.
    isMasterAdmin: z.boolean().optional(),
    // ISSUE LETTERS — may create, issue and email HR letters without being an
    // admin. A row in `capability_grants` (migrations 0226/0228), so this is a
    // REQUEST to change that grant rather than a column to write.
    //
    // Deliberately absent from BulkEditEmployeesSchema for the same reason
    // `isAdmin` is: that patch is built key-by-key and must not carry a
    // privilege change.
    canIssueLetters: z.boolean().optional(),
    // The number you CALL (0204). Deliberately LOOSER than `whatsappPhone`:
    // that one is fed to the WhatsApp API and must be E.164, whereas this is
    // only ever read by a human or handed to a `tel:` link. Rejecting a locally
    // formatted number here would stop HR recording the number they actually
    // have, which is worse than storing it unnormalised.
    phone: z
      .union([z.string().trim().max(32), z.literal(""), z.null()])
      .optional(),
    // M4 — multi-channel admin controls.  `whatsappPhone` must be valid
    // E.164 (or empty/null to clear); the other three are simple booleans.
    whatsappPhone: z
      .union([
        z
          .string()
          .trim()
          .regex(
            /^\+[1-9]\d{1,14}$/,
            "WhatsApp phone must be E.164 (e.g. +919820062511)",
          ),
        z.literal(""),
        z.null(),
      ])
      .optional(),
    whatsappOptedIn: z.boolean().optional(),
    emailOptIn:      z.boolean().optional(),
    slackOptIn:      z.boolean().optional(),
    // Anti-proxy attendance: exempt employees whose device has no biometric
    // sensor from the mandatory-fingerprint punch rule (they fall back to GPS).
    attendanceBiometricExempt: z.boolean().optional(),
    /* ── EMPLOYEE MASTER (0225) ───────────────────────────────────────────
       The consolidated master edits these in its workspace. They are added to
       the EXISTING schema and the EXISTING action rather than given a second
       write path: one validator, one audit trail, one cache invalidation.
       Every key stays optional, so the sparse-patch guarantee above is intact. */
    /** FK to `functions`. Null clears it. */
    functionId: z.string().uuid().nullable().optional(),
    /** FK to `shift_types`. NOT the pay basis — see `workerType`. */
    shiftTypeId: z.string().uuid().nullable().optional(),
    /** FK to `paying_entities`. */
    payingEntityId: z.string().uuid().nullable().optional(),
    /** FK to `designations`. */
    designationId: z.string().uuid().nullable().optional(),
    /** Descriptive only — grants no permission. */
    isTeamLead: z.boolean().optional(),
    trainPass: z.boolean().optional(),
    /** Date of Joining. */
    joinedAt: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    probationEnd: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    /**
     * 0244. REQUIRED FOR A NON-INTERN, but "required" is a cross-field rule and
     * cannot live here: this schema cannot read the designation's
     * `employee_type`, which is what decides whether it applies. So the shape
     * lives here and the requirement is enforced in `editEmployee` — the one
     * function every create, edit and bulk path already funnels through.
     */
    internshipStart: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    /** The per-person override of the designation's employee type. Empty = follow
     *  the designation, which is the common case and why it is `""`-able. */
    employeeType: z.union([z.enum(EMPLOYEE_TYPES), z.literal(""), z.null()]).optional(),
    /** Date of Completion — the last working day. */
    lastWorkingDay: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    /** Office mail. Distinct from `email`, which is the LOGIN address and is
     *  changed through the invite flow, not here. */
    officialEmail: z.union([z.string().trim().email().max(160), z.literal(""), z.null()]).optional(),
    personalEmail: z.union([z.string().trim().email().max(160), z.literal(""), z.null()]).optional(),

    /* ── Employee schedule settings (0228) ─────────────────────────────────
       Every one is `.optional()`, which is what carries the sparse-patch
       contract through to the server: absent means LEAVE ALONE, and only a key
       that is actually present is written. A boolean here has no `null` form on
       purpose — the columns are NOT NULL, so "clear it" is not a state they
       have; the only two answers are Yes and No.                            */

    /** No = not required to punch; absence never reaches a deduction. */
    attendanceApplicable: z.boolean().optional(),

    /** Which Saturdays of the month this person works. */
    sat1Working: z.boolean().optional(),
    sat2Working: z.boolean().optional(),
    sat3Working: z.boolean().optional(),
    sat4Working: z.boolean().optional(),
    sat5Working: z.boolean().optional(),

    /** Monday–Friday timings. These are the EXISTING columns the attendance
     *  engine already grades against — deliberately not a new pair, so the
     *  Employee Master and the Attendance schedule screen cannot drift apart
     *  about what this employee's day is. "" clears back to the org default. */
    attOfficialStart: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),
    attOfficialEnd: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),

    /** Saturday timings. Null/"" means "same as Monday–Friday". */
    satOfficialStart: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),
    satOfficialEnd: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),

    /** Work-from-home entitlement. Independent of each other. */
    wfhFullTimeAllowed: z.boolean().optional(),
    wfhPartTimeAllowed: z.boolean().optional(),
  })
  .strict()
  .refine(
    // Saturday cannot end before it starts. Mirrors the database CHECK
    // `employees_sat_hours_ordered` so the admin gets a sentence instead of a
    // constraint violation, and so the rule holds even if a future caller
    // writes the columns without going through the database.
    (v) =>
      !v.satOfficialStart ||
      !v.satOfficialEnd ||
      v.satOfficialStart < v.satOfficialEnd,
    {
      message: "Saturday's end time must be after its start time.",
      path: ["satOfficialEnd"],
    },
  )
  .refine(
    (v) =>
      !v.attOfficialStart ||
      !v.attOfficialEnd ||
      v.attOfficialStart < v.attOfficialEnd,
    {
      message: "The end time must be after the start time.",
      path: ["attOfficialEnd"],
    },
  )
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: "No changes to save." },
  );

export type EditEmployeeInput = z.infer<typeof EditEmployeeSchema>;

/**
 * Patch shape for `bulkEditEmployees` — the "Edit All" flow.
 *
 * SPARSE BY CONSTRUCTION, and that is the whole safety property. Every key is
 * optional, and the server writes ONLY the keys that are present: an admin who
 * changes just Worker Type must not have the other five schedule fields
 * silently overwritten with blanks on every selected employee. The bulk editor
 * therefore starts every control in a "No Change" state and omits the key
 * entirely until it is touched — absent means "leave it alone", which is a
 * different thing from null ("clear the override back to the company default").
 *
 * DELIBERATELY NOT BULK-EDITABLE:
 *   · `name` and `whatsappPhone` — per-person identity; one value across many
 *     people is never the intent.
 *   · `isAdmin` — super-admin gated, and granting admin to a whole selection by
 *     mistake is not a recoverable click.
 * Those stay in single-employee edit only.
 */
export const BulkEditEmployeesSchema = z
  .object({
    role: z.enum(["doer", "initiator", "both"]).optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    primaryDepartmentId: z.string().uuid().nullable().optional(),
    managerId: z.string().uuid().nullable().optional(),
    dailyTaskQuota: z.coerce.number().int().min(0).max(50).optional(),
    whatsappOptedIn: z.boolean().optional(),
    // Schedule. `weeklyOff` 0..6 (0=Sun); the four times accept "" / null to
    // CLEAR the override back to the company default.
    workerType: z.enum(WORKER_TYPES).optional(),
    weeklyOff: z.number().int().min(0).max(6).optional(),
    attOfficialStart: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),
    attLateAfter: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),
    attOfficialEnd: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),
    attEarlyBefore: z.union([TIME_HHMM, z.literal(""), z.null()]).optional(),
    /* ── EMPLOYEE MASTER (0225) ───────────────────────────────────────────
       The consolidated master edits these in its workspace. They are added to
       the EXISTING schema and the EXISTING action rather than given a second
       write path: one validator, one audit trail, one cache invalidation.
       Every key stays optional, so the sparse-patch guarantee above is intact. */
    /** FK to `functions`. Null clears it. */
    functionId: z.string().uuid().nullable().optional(),
    /** FK to `shift_types`. NOT the pay basis — see `workerType`. */
    shiftTypeId: z.string().uuid().nullable().optional(),
    /** FK to `paying_entities`. */
    payingEntityId: z.string().uuid().nullable().optional(),
    /** FK to `designations`. */
    designationId: z.string().uuid().nullable().optional(),
    /** Descriptive only — grants no permission. */
    isTeamLead: z.boolean().optional(),
    trainPass: z.boolean().optional(),
    /** Date of Joining. */
    joinedAt: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    probationEnd: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    /** 0244 — internship start (the end is generated) and the employee-type
     *  override. Both are written through the same `editEmployee` the single
     *  edit uses, so the required-probation rule covers bulk too. */
    internshipStart: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
    employeeType: z.union([z.enum(EMPLOYEE_TYPES), z.literal(""), z.null()]).optional(),
    /** Date of Completion — the last working day. */
    lastWorkingDay: z.union([ISO_DATE, z.literal(""), z.null()]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Nothing to apply — no field was changed.",
  });

export type BulkEditEmployeesInput = z.infer<typeof BulkEditEmployeesSchema>;
