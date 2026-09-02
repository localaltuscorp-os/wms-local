/**
 * HISTORIC ATTENDANCE BACKFILL — pure planning engine (no IO).
 *
 * Turns rows parsed from an attendance SHEET (employees whose in-app punches
 * were lost to an app error) into an exact, reviewable plan of which
 * `attendance_logs` rows WOULD be inserted, honouring the module's invariants:
 *
 *  - Dedup key = the DB's own unique index (employee_id, log_date, kind):
 *    one in + one out per employee per day, so a backfill can never double-punch.
 *  - NEVER clobber an existing punch: any (employee, day, kind) slot that
 *    already has a row — a genuine self punch (source='self', biometric/gps)
 *    or an earlier admin fix — is SKIPPED here and the writer additionally
 *    uses ON CONFLICT DO NOTHING, so even a race cannot overwrite it. (This is
 *    the one deliberate difference from the admin upsertPunchCore, which is
 *    DO UPDATE.)
 *  - `logged_at` must carry the real wall-clock instant in the employee's
 *    timezone — grading (foldPunches) keys days off logged_at, not log_date,
 *    so a date-only insert would grade as garbage. `zonedWallClockToUtc` below
 *    mirrors the admin action's converter (app/(app)/attendance/actions.ts).
 *  - Unmatched names are reported, never guessed (aliases are explicit).
 *
 * The engine is pure so the DRY-RUN report and the write pass are the same
 * plan by construction — what you review is exactly what gets written.
 * IO (sheet read, DB insert, employee_events + sync_runs audit) lives in
 * scripts/backfill-attendance.ts.
 */

export interface BackfillSheetRow {
  /** Name exactly as it appears in the sheet. */
  employeeName: string;
  /** Calendar day 'YYYY-MM-DD' (in the employee's timezone). */
  date: string;
  /** Wall-clock 'HH:mm' in the employee's timezone; null = no in-punch known. */
  inTime: string | null;
  /** Wall-clock 'HH:mm'; null = no out-punch known. */
  outTime: string | null;
}

export interface BackfillEmployee {
  id: string;
  name: string;
  /** IANA tz; falls back to Asia/Kolkata like the rest of the module. */
  timezone: string | null;
}

export interface PlannedPunch {
  employeeId: string;
  employeeName: string;
  logDate: string;
  kind: "in" | "out";
  /** The UTC instant whose wall-clock in the employee tz is the sheet time. */
  loggedAt: Date;
  /** 'HH:mm' as it appeared in the sheet — for the dry-run report + audit. */
  wallClock: string;
}

export interface BackfillPlan {
  /** Punches that would be INSERTED (missing slots only). */
  inserts: PlannedPunch[];
  /** Slots skipped because a real punch already exists — never touched. */
  skippedExisting: number;
  /** Sheet names that matched no employee (after aliases) — fix, don't guess. */
  unmatchedNames: string[];
  /** Rows dropped for bad date/time format (counted, never partially applied). */
  invalidRows: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Key for the existing-punch set: one string per occupied (emp, day, kind). */
export const punchKey = (employeeId: string, logDate: string, kind: "in" | "out") =>
  `${employeeId}|${logDate}|${kind}`;

/**
 * Build the full plan. `existing` must contain punchKey(...) for EVERY
 * attendance_logs row in the affected date span (the script loads these).
 * `aliases` maps normalized sheet-name → normalized app-name (same shape as
 * the salary importer's alias map).
 */
export function planBackfill(
  rows: BackfillSheetRow[],
  employeesByNorm: Map<string, BackfillEmployee>,
  aliases: Map<string, string>,
  existing: Set<string>,
): BackfillPlan {
  const inserts: PlannedPunch[] = [];
  const unmatched = new Set<string>();
  let skippedExisting = 0;
  let invalidRows = 0;
  // Guard against the same (emp, day, kind) appearing twice in the sheet.
  const plannedKeys = new Set<string>();

  for (const row of rows) {
    const key = normName(row.employeeName);
    const emp = employeesByNorm.get(key) ?? employeesByNorm.get(aliases.get(key) ?? "");
    if (!emp) {
      unmatched.add(row.employeeName);
      continue;
    }
    if (!DATE_RE.test(row.date)) {
      invalidRows++;
      continue;
    }
    const tz = emp.timezone || "Asia/Kolkata";

    for (const [kind, hhmm] of [
      ["in", row.inTime],
      ["out", row.outTime],
    ] as const) {
      if (hhmm == null || hhmm === "") continue;
      if (!TIME_RE.test(hhmm)) {
        invalidRows++;
        continue;
      }
      const k = punchKey(emp.id, row.date, kind);
      if (existing.has(k) || plannedKeys.has(k)) {
        skippedExisting++;
        continue;
      }
      plannedKeys.add(k);
      inserts.push({
        employeeId: emp.id,
        employeeName: emp.name,
        logDate: row.date,
        kind,
        loggedAt: zonedWallClockToUtc(row.date, hhmm, tz),
        wallClock: hhmm,
      });
    }
  }

  return {
    inserts,
    skippedExisting,
    unmatchedNames: [...unmatched].sort(),
    invalidRows,
  };
}

/**
 * Build a timestamptz for `${ymd} ${hhmm}` interpreted as wall-clock time in
 * `tz`. Pure mirror of the admin punch action's converter (kept in sync with
 * app/(app)/attendance/actions.ts `zonedWallClockToUtc`): treat the fields as
 * UTC, then correct by the zone's offset at that instant. Exact for India
 * (no DST), the only configured timezone.
 */
export function zonedWallClockToUtc(ymd: string, hhmm: string, tz: string): Date {
  const dParts = ymd.split("-").map((n) => parseInt(n, 10));
  const tParts = hhmm.split(":").map((n) => parseInt(n, 10));
  const y = dParts[0] ?? 1970;
  const mo = dParts[1] ?? 1;
  const d = dParts[2] ?? 1;
  const h = tParts[0] ?? 0;
  const mi = tParts[1] ?? 0;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offsetMs = tzOffsetMs(new Date(asUtc), tz);
  return new Date(asUtc - offsetMs);
}

/** Offset (ms) of `tz` from UTC at instant `at` (positive east of UTC). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return zonedAsUtc - at.getTime();
}
