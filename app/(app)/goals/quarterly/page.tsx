import { LevelPageShell, type LevelPageSearchParams } from "../level-page-shell";

export const dynamic = "force-dynamic";

/** Quarterly Goals — a Q1–Q4 button row (current quarter pre-selected) scoping
 *  the board to that quarter's goals; quick-add drops into it, and cards drag
 *  between the quarter pills. Deep-linkable: `?q=Q2` (sugar) or
 *  `?period=2026-Q2` (what the pills push). */
export default async function QuarterlyGoalsPage({
  searchParams,
}: {
  searchParams: Promise<LevelPageSearchParams>;
}) {
  return (
    <LevelPageShell
      sp={await searchParams}
      level="quarter"
      basePath="/goals/quarterly"
      heading="Quarterly Goals"
    />
  );
}
