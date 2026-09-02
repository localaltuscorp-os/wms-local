import { LevelPageShell, type LevelPageSearchParams } from "../level-page-shell";

export const dynamic = "force-dynamic";

/** Monthly Goals — a SIX-MONTH window (the live quarter and the next), each
 *  month under its quarter and each quarter under its financial year, with the
 *  current month pre-selected and scoping the board to that month's goals.
 *  Everything earlier sits behind "Show past", which reveals the previous
 *  quarter in place. Quick-add drops into the selected month.
 *  Deep-linkable: `?m=2026-07` (sugar) or `?period=2026-07` — a month key from
 *  another FY brings its FY with it. */
export default async function MonthlyGoalsPage({
  searchParams,
}: {
  searchParams: Promise<LevelPageSearchParams>;
}) {
  return (
    <LevelPageShell
      sp={await searchParams}
      level="month"
      basePath="/goals/monthly"
      heading="Monthly Goals"
    />
  );
}
