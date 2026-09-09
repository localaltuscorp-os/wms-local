import { z } from "zod";
import { WORKER_TYPES } from "@/db/enums";

/** HH:mm, matching lib/validators/attendance.ts — the schedule columns are
 *  written by both this bulk patch and the single-employee schedule action. */
const TIME_HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm");

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
  })
  .strict()
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
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Nothing to apply — no field was changed.",
  });

export type BulkEditEmployeesInput = z.infer<typeof BulkEditEmployeesSchema>;
