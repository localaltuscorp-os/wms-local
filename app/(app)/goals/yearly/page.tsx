import { LevelPageShell, type LevelPageSearchParams } from "../level-page-shell";

export const dynamic = "force-dynamic";

/** Yearly Goals — the module landing. The weekly-goals-board design listing
 *  ALL the FY's YEAR goals (one bucket, no period sub-nav; FY + person nav in
 *  the header). Each year goal cascades into quarters on /goals/quarterly. */
export default async function YearlyGoalsPage({
  searchParams,
}: {
  searchParams: Promise<LevelPageSearchParams>;
}) {
  return (
    <LevelPageShell
      sp={await searchParams}
      level="year"
      basePath="/goals/yearly"
      heading="Yearly Goals"
      tagline="Every goal for the financial year — each one cascades into quarters, months and weeks below it."
    />
  );
}
