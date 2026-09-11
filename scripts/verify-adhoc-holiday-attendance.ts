/**
 * PROVE the brief's own example, against the live database, changing nothing.
 *
 *   HR → Holiday List:  18 September — Office Holiday
 *   Attendance for 18 September should automatically show: Holiday
 *
 * ── WHY A SCRIPT AND NOT ONLY A UNIT TEST ──────────────────────────────────
 * The unit tests prove the day-code engine grades `isHoliday` as H, and that the
 * HR action writes to the `holidays` table. What they cannot prove is the JOIN
 * between those two facts on real data: that a row inserted by HR actually
 * appears in the set the attendance grader asks for. That is the single
 * source-of-truth claim, and it is the one worth checking against production
 * rather than against a fixture.
 *
 * So this inserts the holiday inside a transaction, re-runs the grader's own
 * calendar query (`lib/queries/holidays.listHolidayDateSet`, replicated here
 * statement-for-statement because that module is `server-only` and cannot be
 * imported from a script), asserts the date is now in the graded set, and then
 * ROLLS BACK. Nothing is left behind.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-adhoc-holiday-attendance.ts
 */
import postgres from "postgres";
import { publishedHolidayDates } from "../lib/hr/holidays-2026";

/** The brief's example date. */
const TEST_DATE = "2026-09-18";
const TEST_LABEL = "Office Holiday";
const YEAR = Number(TEST_DATE.slice(0, 4));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file=.env.local");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });

/**
 * `date` columns, as 'YYYY-MM-DD'.
 *
 * ── WHY THIS EXISTS, AND WHAT IT IS NOT ────────────────────────────────────
 * The real `listHolidayDateSet` reads through DRIZZLE, whose `date()` column
 * returns a plain 'YYYY-MM-DD' STRING — so its `String(r.holidayDate)` is a
 * no-op and the set contains exactly the keys `holidaySet.has(ymd)` looks up.
 *
 * This script talks to raw postgres.js instead (it cannot import the
 * `server-only` query module), and postgres.js parses `date` into a JS `Date`
 * at UTC midnight of the stored day. `String()` on that gives
 * "Thu Sep 18 2026 05:30:00 GMT+0530…", which matches nothing in a set keyed on
 * 'YYYY-MM-DD'.
 *
 * This was a defect in the VERIFICATION HARNESS, not in the application. The
 * first run of this script reported the holiday missing; the application was
 * correct all along (Drizzle hands back strings, confirmed directly), and the
 * divergence was here. It is written down because a harness that cries wolf is
 * worse than no harness, and because the next person to copy this replication
 * pattern will hit the same thing.
 */
function ymd(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    // UTC getters, because postgres.js constructs the Date at UTC midnight of
    // the stored calendar day (a `2022-12-31` row comes back as
    // 2022-12-31T00:00:00Z, which prints as 05:30 IST on the same day). Local
    // getters would be right for a local-midnight Date and wrong here, so the
    // choice is asserted by `assertYmdRoundTrip` below rather than assumed.
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

/**
 * Prove `ymd` against the database before trusting it.
 *
 * The first version of this script silently mis-converted dates and reported a
 * working integration as broken. A conversion this easy to get wrong, in a
 * harness whose whole job is to be believed, gets checked: Postgres formats the
 * same column as text, and the two must agree for every row.
 */
async function assertYmdRoundTrip(tx: postgres.TransactionSql): Promise<string | null> {
  const rows = await tx<{ raw: unknown; text: string }[]>`
    SELECT holiday_date AS raw, to_char(holiday_date, 'YYYY-MM-DD') AS text
      FROM holidays ORDER BY holiday_date LIMIT 200`;
  for (const r of rows) {
    if (ymd(r.raw) !== r.text) {
      return `date conversion is wrong: driver gave ${JSON.stringify(String(r.raw))} → ${ymd(r.raw)}, Postgres says ${r.text}`;
    }
  }
  return null;
}

/**
 * The grader's calendar, replicated from lib/queries/holidays.listHolidayDateSet.
 *
 * Kept statement-for-statement rather than paraphrased: if the real one changes
 * shape, this script should be updated alongside it, and a divergence here is
 * the signal that the integration has moved.
 */
async function gradedHolidaySet(
  tx: postgres.TransactionSql,
  year: number,
): Promise<Set<string>> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const adminRows = await tx<{ holiday_date: unknown; is_active: boolean }[]>`
    SELECT holiday_date, is_active FROM holidays
     WHERE holiday_date >= ${from} AND holiday_date <= ${to}`;

  const masterRows = await tx<{ holiday_date: unknown }[]>`
    SELECT holiday_date FROM event_holidays
     WHERE holiday_date >= ${from} AND holiday_date <= ${to}
       AND is_office_closed = true
       AND is_optional = false
       AND is_festival_marker = false
       AND is_exam_marker = false
       AND applies_to IN ('all', 'custom')`.catch(() => []);

  const suppressed = new Set(
    adminRows.filter((r) => !r.is_active).map((r) => ymd(r.holiday_date)),
  );

  const dates = [
    ...publishedHolidayDates(year),
    ...adminRows.filter((r) => r.is_active).map((r) => ymd(r.holiday_date)),
    ...masterRows.map((r) => ymd(r.holiday_date)),
  ];
  return new Set(dates.filter((d) => !suppressed.has(d)));
}

async function main() {
  console.log(`Verifying: an ad-hoc holiday on ${TEST_DATE} reaches the attendance grader.\n`);
  let failed = false;
  const fail = (msg: string) => {
    failed = true;
    console.error(`  FAIL  ${msg}`);
  };

  await sql
    .begin(async (tx) => {
      // ── THE HARNESS CHECKS ITSELF FIRST ───────────────────────────────────
      const conversionBug = await assertYmdRoundTrip(tx);
      if (conversionBug) {
        fail(conversionBug);
        throw new Error("__ROLLBACK__");
      }
      console.log("  ✓ date conversion agrees with Postgres on every existing row");

      // ── BEFORE ────────────────────────────────────────────────────────────
      const before = await gradedHolidaySet(tx, YEAR);
      console.log(`  graded holidays in ${YEAR}, before: ${before.size}`);
      if (before.has(TEST_DATE)) {
        // Not a failure of the integration — just means the example date is
        // already a holiday, so the test proves nothing. Say so rather than
        // reporting a false pass.
        fail(
          `${TEST_DATE} is ALREADY a graded holiday, so this check cannot demonstrate anything. Pick another date.`,
        );
        throw new Error("__ROLLBACK__");
      }
      console.log(`  ${TEST_DATE} is NOT currently a holiday — good starting point`);

      // ── THE HR WRITE ──────────────────────────────────────────────────────
      // Exactly what addAdHocHoliday inserts, including the new note column.
      const [inserted] = await tx<{ id: string }[]>`
        INSERT INTO holidays (holiday_date, label, note)
        VALUES (${TEST_DATE}, ${TEST_LABEL}, ${"Declared for the integration check"})
        RETURNING id`;
      console.log(`  inserted HR ad-hoc holiday (${inserted!.id})`);

      // ── AFTER ─────────────────────────────────────────────────────────────
      const after = await gradedHolidaySet(tx, YEAR);
      console.log(`  graded holidays in ${YEAR}, after:  ${after.size}`);

      if (!after.has(TEST_DATE)) {
        fail(`${TEST_DATE} did NOT appear in the attendance grader's calendar`);
      } else {
        console.log(`  ✓ ${TEST_DATE} is now a graded holiday — attendance will show Holiday`);
      }
      if (after.size !== before.size + 1) {
        fail(`expected exactly one new holiday, got ${after.size - before.size}`);
      } else {
        console.log("  ✓ exactly ONE holiday was added — no duplicate entry");
      }

      // ── THE NOTE ROUND-TRIPS ──────────────────────────────────────────────
      const [row] = await tx<{ label: string; note: string | null; is_active: boolean }[]>`
        SELECT label, note, is_active FROM holidays WHERE id = ${inserted!.id}`;
      if (row!.label !== TEST_LABEL) fail(`label read back as "${row!.label}"`);
      if (!row!.note) fail("the optional note did not round-trip");
      if (!row!.is_active) fail("a new holiday must be active");
      console.log(`  ✓ stored: "${row!.label}" · note: "${row!.note}" · active: ${row!.is_active}`);

      // ── WITHDRAWAL still means "not a holiday" ────────────────────────────
      // The suppression rule is what lets a published day be cancelled, and an
      // edit must never be able to resurrect one silently.
      await tx`UPDATE holidays SET is_active = false WHERE id = ${inserted!.id}`;
      const suppressedSet = await gradedHolidaySet(tx, YEAR);
      if (suppressedSet.has(TEST_DATE)) {
        fail(`${TEST_DATE} is still graded a holiday after being withdrawn`);
      } else {
        console.log(`  ✓ withdrawing it removes ${TEST_DATE} from the graded calendar again`);
      }

      throw new Error("__ROLLBACK__");
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__ROLLBACK__") {
        console.log("\nRolled back. The database is unchanged.");
        return;
      }
      failed = true;
      console.error("\nAborted (and rolled back):", msg);
    });

  await sql.end();
  if (failed) {
    console.error("\nVERIFICATION FAILED");
    process.exit(1);
  }
  console.log("VERIFICATION PASSED — the HR Holiday List is the attendance calendar.");
}

void main();
