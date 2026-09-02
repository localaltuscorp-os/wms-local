import { z } from "zod";

const IANA_TIMEZONE_RE = /^[A-Za-z][A-Za-z0-9+\-_/]{1,63}$/;

const WorkingDaySchema = z
  .number()
  .int()
  .min(0, "Day of week is 0–6")
  .max(6, "Day of week is 0–6");

/**
 * Patch-shaped schema for `updateOrgSettings`. Every field is optional;
 * Server Action writes only the keys actually supplied. Reject empty
 * patches so a "Save" with no changes doesn't burn a round-trip.
 */
export const UpdateOrgSettingsSchema = z
  .object({
    companyName: z.string().trim().min(1, "Company name is required").max(120).optional(),
    logoUrl: z
      .string()
      .trim()
      .max(2048)
      .url("Logo URL must be a valid URL")
      .optional()
      .nullable()
      .or(z.literal("")),
    digestHourIst: z
      .number()
      .int()
      .min(0, "Hour is 0–23")
      .max(23, "Hour is 0–23")
      .optional(),
    workingDays: z
      .array(WorkingDaySchema)
      .min(1, "Pick at least one working day")
      .max(7)
      .optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .regex(IANA_TIMEZONE_RE, "Timezone must look like Region/City")
      .optional(),
    idleTimeoutMinutes: z
      .number()
      .int("Idle timeout must be a whole number")
      .min(5, "Idle timeout must be at least 5 minutes")
      .max(60, "Idle timeout must be at most 60 minutes")
      .optional(),
    allowSelfRegister: z.boolean().optional(),
    // 0054 — attendance geofence. Lat+lng move together; null clears the
    // fence (punches accepted from anywhere again).
    officeLat: z.number().min(-90).max(90).optional().nullable(),
    officeLng: z.number().min(-180).max(180).optional().nullable(),
    attendanceRadiusM: z
      .number()
      .int("Radius must be a whole number of metres")
      .min(25, "Radius must be at least 25m (GPS accuracy floor)")
      .max(5000, "Radius must be at most 5km")
      .optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: "No changes to save." },
  );

export type UpdateOrgSettingsInput = z.infer<typeof UpdateOrgSettingsSchema>;
