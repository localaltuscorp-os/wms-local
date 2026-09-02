// Seed the Monthly Events Master holiday master for FY26 (fyStartYear 2026,
// Apr'26–Mar'27) AND FY27 (fyStartYear 2027, Apr'27–Mar'28).
//
// Idempotent — `on conflict (name, fy_start_year, holiday_date) do nothing`.
// Run (HUMAN runs this, after applying migration 0130):
//   pnpm tsx --env-file=.env.local scripts/seed-events-holidays.ts
//
// IMPORTANT (design §7): EVERY named holiday seeds as applies_to='all'. NOTHING
// is pre-tagged hindu_only — Sir tags exactly 4 in the admin UI later.
//
// DATES: fixed-Gregorian (Republic Day 26 Jan, Independence Day 15 Aug, 1st
// January 1 Jan) are exact. Lunar / Islamic / Easter dates are BEST-KNOWN from a
// Drik-Panchang-style lookup and each carries notes='verify date' — the admin
// confirms/edits them (they can drift a day, and spring festivals sit near the
// Apr FY boundary). Religion add-ons (Christian / Muslim) seed office-open +
// optional so they never company-block the calendar; they surface only on the
// matching employees' personalised list.

import { calendarEvents, eventHolidays } from "@/db/schema";
import { db } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import type { HolidayAppliesTo } from "@/db/enums";

// Inlined here (not imported from lib/monthly-events/reconcile) because that
// module chain is guarded by `import "server-only"`, which throws under plain
// tsx. This mirrors reconcileHolidayEvents exactly: one locked all-day banner
// per office-closed holiday, keyed on (source='holiday', source_ref_id).
async function projectHolidayBanner(holidayId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [holiday] = await tx
      .select()
      .from(eventHolidays)
      .where(eq(eventHolidays.id, holidayId))
      .limit(1);
    const existing = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.source, "holiday"),
          eq(calendarEvents.sourceRefId, holidayId),
        ),
      );
    if (!holiday || !holiday.isOfficeClosed) {
      if (existing.length > 0) {
        await tx
          .delete(calendarEvents)
          .where(
            and(
              eq(calendarEvents.source, "holiday"),
              eq(calendarEvents.sourceRefId, holidayId),
            ),
          );
      }
      return;
    }
    const shape = {
      title: holiday.name,
      categoryId: null,
      colorOverride: null,
      eventDate: holiday.holidayDate,
      startMin: null,
      endMin: null,
      allDay: true,
      status: "confirmed" as const,
      location: null,
      notes: null,
      source: "holiday" as const,
      sourceRefId: holidayId,
      isLocked: true,
      obligationId: null,
      updatedById: holiday.updatedById ?? holiday.createdById ?? null,
      updatedAt: new Date(),
    };
    if (existing.length === 0) {
      await tx
        .insert(calendarEvents)
        .values({ ...shape, createdById: holiday.createdById ?? null });
      return;
    }
    const [keep, ...extras] = existing;
    await tx
      .update(calendarEvents)
      .set(shape)
      .where(eq(calendarEvents.id, keep!.id));
    for (const ex of extras) {
      await tx.delete(calendarEvents).where(eq(calendarEvents.id, ex.id));
    }
  });
}

type Kind = "national" | "hindu" | "christian" | "muslim";

interface Spec {
  name: string;
  date: string; // yyyy-mm-dd
  kind: Kind;
  verify: boolean; // → notes='verify date'
}

// ── Named 14 (applies_to='all'; Sir tags hindu_only later) ────────────────────
// FY26 window = Apr 2026 – Mar 2027.
const FY26_NAMED: Spec[] = [
  { name: "Independence Day", date: "2026-08-15", kind: "national", verify: false },
  { name: "Rakshabandhan", date: "2026-08-28", kind: "hindu", verify: true },
  { name: "Janmashtami", date: "2026-09-04", kind: "hindu", verify: true },
  { name: "Ganpati Day 1", date: "2026-09-14", kind: "hindu", verify: true },
  { name: "Ganpati Day 10", date: "2026-09-23", kind: "hindu", verify: true },
  { name: "Dashera", date: "2026-10-20", kind: "hindu", verify: true },
  { name: "Diwali", date: "2026-11-08", kind: "hindu", verify: true },
  { name: "New Year", date: "2026-11-09", kind: "hindu", verify: true }, // Bali Pratipada
  { name: "Bhai Dooj", date: "2026-11-10", kind: "hindu", verify: true },
  { name: "1st January", date: "2027-01-01", kind: "national", verify: false },
  { name: "Republic Day", date: "2027-01-26", kind: "national", verify: false },
  { name: "Shiv Ratri", date: "2027-03-06", kind: "hindu", verify: true },
  { name: "Holi Day 2", date: "2027-03-23", kind: "hindu", verify: true },
  { name: "Gudhi Padwa", date: "2027-03-29", kind: "hindu", verify: true },
];

// FY27 window = Apr 2027 – Mar 2028.
const FY27_NAMED: Spec[] = [
  { name: "Independence Day", date: "2027-08-15", kind: "national", verify: false },
  { name: "Rakshabandhan", date: "2027-08-17", kind: "hindu", verify: true },
  { name: "Janmashtami", date: "2027-08-25", kind: "hindu", verify: true },
  { name: "Ganpati Day 1", date: "2027-09-04", kind: "hindu", verify: true },
  { name: "Ganpati Day 10", date: "2027-09-13", kind: "hindu", verify: true },
  { name: "Dashera", date: "2027-10-09", kind: "hindu", verify: true },
  { name: "Diwali", date: "2027-10-29", kind: "hindu", verify: true },
  { name: "New Year", date: "2027-10-30", kind: "hindu", verify: true }, // Bali Pratipada
  { name: "Bhai Dooj", date: "2027-10-31", kind: "hindu", verify: true },
  { name: "1st January", date: "2028-01-01", kind: "national", verify: false },
  { name: "Republic Day", date: "2028-01-26", kind: "national", verify: false },
  { name: "Shiv Ratri", date: "2028-02-23", kind: "hindu", verify: true },
  { name: "Holi Day 2", date: "2028-03-12", kind: "hindu", verify: true },
  { name: "Gudhi Padwa", date: "2028-03-27", kind: "hindu", verify: true },
];

// ── Religion add-ons REMOVED (per Sir 2026-07-17) ─────────────────────────────
// The office holiday master is EXACTLY the named 14 (applies_to='all'). The
// Christian/Muslim optional office-open markers (Easter, Christmas Eve, Eid
// al-Fitr, Bakri Eid, Muharram, Ashura) were dropped so the calendar shows only
// the sanctioned list. `appliesTo`/christian/muslim kept for future re-tagging.

function appliesTo(kind: Kind): HolidayAppliesTo {
  if (kind === "christian") return "christian";
  if (kind === "muslim") return "muslim";
  return "all"; // national + hindu → 'all' (Sir tags hindu_only later)
}

function toRow(spec: Spec, fyStartYear: number) {
  const isAddon = spec.kind === "christian" || spec.kind === "muslim";
  return {
    name: spec.name,
    fyStartYear,
    holidayDate: spec.date,
    appliesTo: appliesTo(spec.kind),
    // Add-ons don't company-close the office; the named 14 do.
    isOfficeClosed: !isAddon,
    isOptional: isAddon,
    // Festivals + add-ons get the marker; the three national days don't.
    isFestivalMarker: spec.kind !== "national",
    isExamMarker: false,
    notes: spec.verify ? "verify date" : null,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

  const rows = [
    ...FY26_NAMED.map((s) => toRow(s, 2026)),
    ...FY27_NAMED.map((s) => toRow(s, 2027)),
  ];

  const inserted = await db
    .insert(eventHolidays)
    .values(rows)
    .onConflictDoNothing({
      target: [
        eventHolidays.name,
        eventHolidays.fyStartYear,
        eventHolidays.holidayDate,
      ],
    })
    .returning({ id: eventHolidays.id });

  console.log(
    `Seeded ${inserted.length} new holiday rows (of ${rows.length} attempted; existing skipped).`,
  );

  // Project locked all-day banners for every office-closed holiday in FY26/FY27.
  let banners = 0;
  try {
    const closed = await db
      .select({ id: eventHolidays.id })
      .from(eventHolidays)
      .where(
        and(
          inArray(eventHolidays.fyStartYear, [2026, 2027]),
          eq(eventHolidays.isOfficeClosed, true),
        ),
      );
    for (const h of closed) {
      await projectHolidayBanner(h.id);
      banners++;
    }
  } catch (err) {
    console.warn("Banner reconcile skipped:", err instanceof Error ? err.message : err);
  }
  console.log(`Reconciled ${banners} office-closed holiday banner(s).`);
  console.log(
    "NOTE: lunar / Islamic / Easter dates are best-known — verify. Nothing is tagged hindu_only; tag exactly 4 in /events/holidays.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
