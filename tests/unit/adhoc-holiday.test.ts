import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeOf } from "../fixtures/source-code";
import { HOLIDAY_ADMIN_EMAILS, canManageHolidays } from "@/lib/hr/holiday-admins";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";
import { expectsScheduledHours } from "@/lib/attendance/hours-rule";
import { isPaidCreditedDay } from "@/lib/attendance/hour-balance";
import { dayCodeStyle } from "@/lib/attendance/day-code-view";

/**
 * AD-HOC HOLIDAYS — permissions, and the single-source-of-truth guarantee.
 *
 * The thing most worth protecting here is NOT the form. It is that the HR
 * Holiday List and the attendance grader read the SAME rows, with no sync step
 * between them. A second holiday store — or a copy of the calendar kept for
 * attendance — is the failure this whole feature exists to avoid, and it is the
 * kind of thing a later change introduces by accident.
 *
 * So the structural assertions below are about WHERE the data lives, and they
 * are the ones that will catch a regression a unit test of the form would miss.
 */

const ROOT = process.cwd();
const HR_ACTIONS = codeOf("app/(app)/hr/holidays/actions.ts");
const HOLIDAY_QUERIES = codeOf("lib/queries/holidays.ts");
const M0221 = readFileSync(join(ROOT, "db/migrations/0221_holiday_note.sql"), "utf8");

describe("permissions — Ruchita and Rutvisha, and nobody else", () => {
  it("the allow-list is exactly those two", () => {
    expect([...HOLIDAY_ADMIN_EMAILS]).toEqual([
      "ruchitaambre.altuscorp@gmail.com",
      "rutvishamehta.altuscorp@gmail.com",
    ]);
  });

  it("admits both of them", () => {
    expect(canManageHolidays("ruchitaambre.altuscorp@gmail.com")).toBe(true);
    expect(canManageHolidays("rutvishamehta.altuscorp@gmail.com")).toBe(true);
  });

  it("refuses a normal employee, an admin, and the founder", () => {
    // Deliberately narrower than admin: anyone who can add a date can give the
    // whole company a paid day off and move everybody's hour target.
    expect(canManageHolidays("someone.else@altuscorp.com")).toBe(false);
    expect(canManageHolidays("manan@unleashed.in")).toBe(false);
    expect(canManageHolidays("rohanchoudhary.altuscorp@gmail.com")).toBe(false);
  });

  it("fails closed on an absent or blank identity", () => {
    expect(canManageHolidays(null)).toBe(false);
    expect(canManageHolidays(undefined)).toBe(false);
    expect(canManageHolidays("")).toBe(false);
    expect(canManageHolidays("   ")).toBe(false);
  });

  it("ALL THREE write actions re-check server-side — create, edit and delete", () => {
    // The panel is hidden for everyone else, but hiding a form is not a
    // control: these are HTTP endpoints, reachable with any arguments by
    // anybody signed in.
    const exported = [...HR_ACTIONS.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(exported).toContain("addAdHocHoliday");
    expect(exported).toContain("editAdHocHoliday");
    expect(exported).toContain("removeAdHocHoliday");

    for (const name of ["addAdHocHoliday", "editAdHocHoliday", "removeAdHocHoliday"]) {
      const start = HR_ACTIONS.indexOf(`export async function ${name}`);
      const after = HR_ACTIONS.indexOf("export async function", start + 1);
      const body = HR_ACTIONS.slice(start, after === -1 ? HR_ACTIONS.length : after);
      expect(body, `${name} must re-check canManageHolidays`).toMatch(
        /canManageHolidays\(me\.email\)/,
      );
    }
  });

  it("READING the list is open to every HR viewer", () => {
    // Seeing that a day is off is not the same capability as declaring it — an
    // employee has to be able to see the holiday on their own calendar.
    const start = HR_ACTIONS.indexOf("export async function listAdHocHolidays");
    const body = HR_ACTIONS.slice(start);
    expect(body).toMatch(/await requireUser\(\)/);
    expect(body).not.toMatch(/canManageHolidays/);
  });
});

describe("ONE holiday store — the HR list IS the attendance calendar", () => {
  it("the HR write path writes to the `holidays` table, not a new one", () => {
    expect(HR_ACTIONS).toMatch(/from "@\/db\/schema"/);
    expect(HR_ACTIONS).toMatch(/\.insert\(holidays\)/);
    expect(HR_ACTIONS).toMatch(/\.update\(holidays\)/);
    expect(HR_ACTIONS).toMatch(/\.delete\(holidays\)/);
  });

  it("the attendance grader's calendar reads that same table", () => {
    // `listHolidayDateSet` is what the grader asks. If this stopped reading
    // `holidays`, an ad-hoc holiday would silently grade as an ordinary working
    // day — which is the exact bug its own header describes having fixed once.
    const start = HOLIDAY_QUERIES.indexOf("export async function listHolidayDateSet");
    const body = HOLIDAY_QUERIES.slice(start);
    expect(body).toMatch(/\.from\(holidays\)/);
    expect(body).toMatch(/holidays\.holidayDate/);
  });

  it("the grader consumes it, so no manual attendance entry is needed", () => {
    const status = codeOf("lib/queries/attendance-status.ts");
    expect(status).toMatch(/listHolidayDateSet/);
    // The per-day decision is a set membership test on the merged calendar.
    expect(status).toMatch(/holidaySet\.has\(/);
  });

  it("declaring or withdrawing a holiday REPRICES the month", () => {
    // A revalidate only clears a render cache; the stored salary runs have to be
    // recomputed or the month keeps the old target hours.
    for (const name of ["addAdHocHoliday", "editAdHocHoliday", "removeAdHocHoliday"]) {
      const start = HR_ACTIONS.indexOf(`export async function ${name}`);
      const after = HR_ACTIONS.indexOf("export async function", start + 1);
      const body = HR_ACTIONS.slice(start, after === -1 ? HR_ACTIONS.length : after);
      expect(body, `${name} must reprice`).toMatch(/refreshMonthAfterCalendarChange/);
    }
  });

  it("an EDIT that moves a holiday reprices BOTH months", () => {
    // Changing the date changes the target hours of the month it left and the
    // month it arrived in, and those need not be the same. Repricing only the
    // new one leaves the old month still crediting a holiday that is gone — a
    // silent overpayment, not a display bug.
    const start = HR_ACTIONS.indexOf("export async function editAdHocHoliday");
    const after = HR_ACTIONS.indexOf("export async function", start + 1);
    const body = HR_ACTIONS.slice(start, after);
    expect(body).toMatch(/new Set\(\[previousDate\.slice\(0, 7\), holidayDate\.slice\(0, 7\)\]\)/);
  });

  it("no parallel holiday table was introduced", () => {
    const schema = codeOf("db/schema.ts");
    const tables = [...schema.matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    const holidayish = tables.filter((t) => t.includes("holiday"));
    // `holidays` (the calendar) and `event_holidays` (Monthly Events Master),
    // both pre-existing and both already merged by listHolidayDateSet.
    expect(holidayish.sort()).toEqual(["event_holidays", "holidays"]);
  });
});

/**
 * A holiday is not an absence, and needs no punch.
 *
 * Driven through the REAL engine rather than asserted against its source. An
 * ad-hoc holiday reaches `computeDayCode` as `ctx.isHoliday = true` — the exact
 * same input a published holiday produces, because both arrive through the one
 * merged `holidaySet`. So proving the behaviour for `isHoliday` proves it for
 * ad-hoc days, which is the whole point of there being one calendar.
 */
describe("a holiday is not an absence, and needs no punch", () => {
  /** A plain 10:00-19:00 day, as `resolveEffectiveConfig` would produce. */
  const SCHED = {
    startTime: "10:00",
    endTime: "19:00",
    lateAfter: "10:15",
    earlyBefore: "18:45",
    halfDayMinutes: 240,
    fullDayMinutes: 480,
    weeklyOffDay: 0,
  } as unknown as AttendanceSchedule;

  const NO_PUNCH = { inAt: null, outAt: null };

  it("grades an unworked holiday H — not A", () => {
    const r = computeDayCode(NO_PUNCH, SCHED, { isWeeklyOff: false, isHoliday: true }, "19:00");
    expect(r.code).toBe("H");
    expect(r.dayValue).toBe(1);
  });

  it("grades the SAME day A when it is not a holiday — the gate is doing the work", () => {
    // The control. Without it, a test that always returned "H" would pass.
    const r = computeDayCode(NO_PUNCH, SCHED, { isWeeklyOff: false, isHoliday: false }, "19:00");
    expect(r.code).toBe("A");
    expect(r.dayValue).toBe(0);
  });

  it("holiday precedence beats the missing-punch rules", () => {
    // No check-in and no check-out on a holiday must not read as late, as
    // having left early, or as a missing punch of either kind.
    const r = computeDayCode(NO_PUNCH, SCHED, { isWeeklyOff: false, isHoliday: true }, "23:59");
    expect(r.late).toBe(false);
    expect(r.leftEarly).toBe(false);
    expect(r.workedMinutes).toBe(0);
  });

  it("expects NO scheduled hours, so it leaves the target alone", () => {
    // `expectsScheduledHours` is the single definition behind every
    // target/required-hours figure — the KPI bar, the overtime threshold and
    // the monthly payroll target. A holiday answering false is what keeps the
    // day out of the denominator, and therefore out of the salary deduction.
    expect(expectsScheduledHours("H")).toBe(false);
    // An ordinary present day does expect them.
    expect(expectsScheduledHours("P")).toBe(true);
    expect(expectsScheduledHours("A")).toBe(true);
  });

  it("uses the EXISTING 'worked on a holiday' rules when somebody does work", () => {
    // The brief: "If an employee actually works on a holiday, use the existing
    // 'worked on holiday' logic." Nothing here is new — HP at 2× for a full
    // stretch, H-H/D at 1.5× for a short one.
    const full = computeDayCode(
      { inAt: "10:00", outAt: "19:00" },
      SCHED,
      { isWeeklyOff: false, isHoliday: true },
      "19:00",
    );
    expect(full.code).toBe("HP");
    expect(full.dayValue).toBe(2);

    const short = computeDayCode(
      { inAt: "10:00", outAt: "12:00" },
      SCHED,
      { isWeeklyOff: false, isHoliday: true },
      "12:00",
    );
    expect(short.code).toBe("H-H/D");
    expect(short.dayValue).toBe(1.5);
  });

  it("an approved PAID LEAVE still outranks a holiday, as it did before", () => {
    // Precedence is unchanged by this work; asserted so a later edit to the
    // holiday branch cannot quietly reorder it.
    const r = computeDayCode(NO_PUNCH, SCHED, { isWeeklyOff: false, isHoliday: true, leave: "paid" }, "19:00");
    expect(r.code).toBe("PL");
  });

  it("the shared palette already renders H, so no new visual state was added", () => {
    expect(dayCodeStyle("H").label.toLowerCase()).toContain("holiday");
  });

  it("sits on NEITHER side of the payroll equation", () => {
    // The existing rule, asserted so this work cannot have moved it: a plain
    // holiday owes no hours (so it shrinks the month's target) and earns no
    // credited minutes (so it adds nothing to payable hours). It simply is not
    // a working day. Together these two are why a holiday cannot become a
    // deduction.
    expect(expectsScheduledHours("H")).toBe(false);
    expect(isPaidCreditedDay("H")).toBe(false);
  });

  it("but WORKING a holiday is credited, exactly as before", () => {
    // HP (full) and H-H/D (short) are the "worked on holiday" codes, and both
    // are paid at the daily target on top of the hours worked.
    expect(isPaidCreditedDay("HP")).toBe(true);
    expect(isPaidCreditedDay("H-H/D")).toBe(true);
    // And neither owes target hours either — the day was never scheduled.
    expect(expectsScheduledHours("HP")).toBe(false);
    expect(expectsScheduledHours("H-H/D")).toBe(false);
  });
});

describe("the note and the edit path (migration 0221)", () => {
  it("adds the note as a nullable column on the existing table", () => {
    expect(M0221).toMatch(/ALTER TABLE holidays\s+ADD COLUMN IF NOT EXISTS note text/);
    expect(M0221).not.toMatch(/CREATE TABLE/i);
    expect(M0221).not.toMatch(/NOT NULL/);
  });

  it("adds the columns an edit needs to be attributable", () => {
    expect(M0221).toMatch(/ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees\(id\)/);
    expect(M0221).toMatch(/ADD COLUMN IF NOT EXISTS updated_at timestamptz/);
  });

  it("does not default updated_at, so an unedited row reads as unedited", () => {
    expect(M0221).not.toMatch(/updated_at timestamptz[^;]*DEFAULT/i);
  });

  it("is idempotent and destroys nothing", () => {
    for (const c of M0221.match(/ADD COLUMN[^\n]*/gi) ?? []) {
      expect(c).toMatch(/IF NOT EXISTS/i);
    }
    expect(M0221).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  });

  it("stores a blank note as NULL, not as an empty string", () => {
    // One representation of "no note", so no reader has to treat "" and NULL as
    // the same thing.
    expect(HR_ACTIONS).toMatch(/parsed\.data\.note\?\.trim\(\) \|\| null/);
  });

  it("the edit refuses a WITHDRAWAL row rather than silently rewriting it", () => {
    // An inactive row is the marker that says a date is NOT a holiday. This
    // panel neither shows nor explains that, so it must not edit one.
    const start = HR_ACTIONS.indexOf("export async function editAdHocHoliday");
    const body = HR_ACTIONS.slice(start, HR_ACTIONS.indexOf("export async function", start + 1));
    expect(body).toMatch(/if \(!current\.isActive\)/);
  });

  it("the edit refuses a no-op save", () => {
    const start = HR_ACTIONS.indexOf("export async function editAdHocHoliday");
    const body = HR_ACTIONS.slice(start, HR_ACTIONS.indexOf("export async function", start + 1));
    expect(body).toMatch(/No changes to save/);
  });

  it("ADD and EDIT share one collision check", () => {
    // `holiday_date` is UNIQUE. Two copies of this check would drift, and the
    // edit would start surfacing a raw constraint error instead of a sentence.
    expect(HR_ACTIONS).toMatch(/async function dateTakenError\(/);
    const add = HR_ACTIONS.slice(
      HR_ACTIONS.indexOf("export async function addAdHocHoliday"),
      HR_ACTIONS.indexOf("export async function editAdHocHoliday"),
    );
    expect(add).toMatch(/dateTakenError\(holidayDate\)/);
    const edit = HR_ACTIONS.slice(HR_ACTIONS.indexOf("export async function editAdHocHoliday"));
    expect(edit).toMatch(/dateTakenError\(holidayDate, id\)/);
  });

  it("a date already on the PUBLISHED calendar is refused", () => {
    // The published list lives in code, not in this table, so without this a
    // duplicate would be accepted and then shown twice on the same page.
    expect(HR_ACTIONS).toMatch(/publishedHolidaysForYear/);
    expect(HR_ACTIONS).toMatch(/already on the published calendar/);
  });
});

describe("the UI offers the three fields and the three actions", () => {
  const panel = codeOf("app/(app)/hr/holidays/adhoc-panel.tsx");

  it("name, date and an optional note", () => {
    expect(panel).toMatch(/type="date"/);
    expect(panel).toMatch(/setLabel/);
    expect(panel).toMatch(/setNote/);
  });

  it("wires create, edit and delete", () => {
    expect(panel).toMatch(/addAdHocHoliday/);
    expect(panel).toMatch(/editAdHocHoliday/);
    expect(panel).toMatch(/removeAdHocHoliday/);
  });

  it("only the two named people are shown the panel", () => {
    // Presentation, not the control — but the page should still not draw a form
    // whose every action would refuse.
    const page = codeOf("app/(app)/hr/holidays/page.tsx");
    expect(page).toMatch(/canManageHolidays\(me\.email\)/);
    expect(page).toMatch(/mayEditHolidays/);
  });

  it("the panel does not name a person", () => {
    expect(panel).not.toMatch(/ruchita|rutvisha/i);
  });
});
