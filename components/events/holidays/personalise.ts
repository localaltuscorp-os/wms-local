import type { Holiday, ReligionCode } from "@/lib/monthly-events/types";

/**
 * Religion-aware holiday personalisation (design §7).
 *
 * Per-employee holiday set =
 *   base(`all`) + own-religion add-ons − (`hindu_only` if religion ≠ hindu).
 *
 * - `all`        → everyone.
 * - `hindu_only` → only when religion === 'hindu'.
 * - `christian`  → only when religion === 'christian'.
 * - `muslim`     → only when religion === 'muslim'.
 * - `custom`     → shown to everyone (a deliberate company-wide holiday whose
 *                  audience the admin set manually).
 *
 * A null/unset religion (or 'other' / 'unspecified') collapses to the base set:
 * `all` + `custom`, with no religion add-ons and no `hindu_only` rows.
 */
export function isHolidayForReligion(
  holiday: Pick<Holiday, "appliesTo">,
  religion: ReligionCode | null | undefined,
): boolean {
  switch (holiday.appliesTo) {
    case "all":
    case "custom":
      return true;
    case "hindu_only":
      return religion === "hindu";
    case "christian":
      return religion === "christian";
    case "muslim":
      return religion === "muslim";
    default:
      return false;
  }
}

/** The personalised, date-sorted holiday list for one employee's religion. */
export function personalisedHolidays(
  holidays: Holiday[],
  religion: ReligionCode | null | undefined,
): Holiday[] {
  return holidays
    .filter((h) => isHolidayForReligion(h, religion))
    .slice()
    .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
}

/** The four sanity-check buckets shown in the admin count preview. */
export const RELIGION_PREVIEW_BUCKETS: ReadonlyArray<{
  key: string;
  label: string;
  religion: ReligionCode | null;
}> = [
  { key: "hindu", label: "Hindu", religion: "hindu" },
  { key: "christian", label: "Christian", religion: "christian" },
  { key: "muslim", label: "Muslim", religion: "muslim" },
  { key: "unspecified", label: "Unspecified", religion: null },
];

/** Per-religion holiday counts (for the admin ~15–16 sanity check). */
export function religionCounts(
  holidays: Holiday[],
): Array<{ key: string; label: string; count: number }> {
  return RELIGION_PREVIEW_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: holidays.filter((h) => isHolidayForReligion(h, b.religion)).length,
  }));
}
