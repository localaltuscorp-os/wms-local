import { z } from "zod";
import { PUNCH_REASONS } from "@/db/enums";

// Pure (DB-free) zod schemas for the admin punch-management actions
// (Attendance Phase A, Task A4). Kept out of the "use server" action file so
// they can be unit-tested without pulling in the DB / server-only chain.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const dateField = z.string().regex(DATE_RE, "Date must be YYYY-MM-DD");
const timeField = z.string().regex(TIME_RE, "Time must be HH:mm");
const kindField = z.enum(["in", "out"]);

/** Admin creates/overwrites a single in/out punch for an employee+day. */
export const AdminUpsertPunch = z
  .object({
    employeeId: z.string().uuid(),
    logDate: dateField,
    kind: kindField,
    timeHHmm: timeField,
    reason: z.enum(PUNCH_REASONS),
  })
  .strict();
export type AdminUpsertPunchInput = z.infer<typeof AdminUpsertPunch>;

/** Admin edits the existing in/out times for an employee+day. At least one of
 *  inHHmm / outHHmm must be supplied. */
export const AdminEditDayTimes = z
  .object({
    employeeId: z.string().uuid(),
    logDate: dateField,
    inHHmm: timeField.optional(),
    outHHmm: timeField.optional(),
  })
  .strict()
  .refine((v) => v.inHHmm != null || v.outHHmm != null, {
    message: "Provide a check-in or check-out time to edit.",
  });
export type AdminEditDayTimesInput = z.infer<typeof AdminEditDayTimes>;

/** Admin deletes a single in/out punch for an employee+day. */
export const AdminDeletePunch = z
  .object({
    employeeId: z.string().uuid(),
    logDate: dateField,
    kind: kindField,
  })
  .strict();
export type AdminDeletePunchInput = z.infer<typeof AdminDeletePunch>;

/**
 * Admin sets an employee's attendance schedule (Task A5). `weeklyOff` is an
 * int 0..6 (0=Sun). The four time overrides are optional HH:mm strings; pass
 * an empty string or null to CLEAR an override back to the company default.
 */
const scheduleOverrideField = z
  .union([timeField, z.literal(""), z.null()])
  .optional();

export const UpdateEmployeeSchedule = z
  .object({
    employeeId: z.string().uuid(),
    weeklyOff: z.number().int().min(0, "Weekly off must be 0..6").max(6, "Weekly off must be 0..6"),
    attOfficialStart: scheduleOverrideField,
    attLateAfter: scheduleOverrideField,
    attOfficialEnd: scheduleOverrideField,
    attEarlyBefore: scheduleOverrideField,
  })
  .strict();
export type UpdateEmployeeScheduleInput = z.infer<typeof UpdateEmployeeSchedule>;
