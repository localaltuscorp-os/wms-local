import { INCENTIVE_STATUS_LABELS, type IncentiveStatus } from "@/db/enums";
import { IncentiveBadge } from "./ui/badges";
import { STATUS_TONE } from "./ui/tone";

/**
 * The one colour map for incentive request states, shared by the list, the
 * history timeline and the decision panel so a state never reads differently
 * on two parts of the same screen.
 *
 * The PAIRINGS are unchanged — green for the two good outcomes, red for the two
 * stops, amber for "waiting on someone", slate for the settled in-between
 * states. What changed is where the colour comes from: `ui/tone.ts` names a
 * design-system family instead of a literal `rgba()`, so the pill follows the
 * employee's own accent and matches every other badge in the app.
 */
export { STATUS_TONE as INCENTIVE_STATUS_TONE } from "./ui/tone";

export function IncentiveStatusPill({ status }: { status: IncentiveStatus | string }) {
  // A state not in the map (legacy/imported) must render, not crash the list.
  const tone = STATUS_TONE[status as IncentiveStatus] ?? "slate";
  return (
    <IncentiveBadge tone={tone}>
      {INCENTIVE_STATUS_LABELS[status as IncentiveStatus] ?? status}
    </IncentiveBadge>
  );
}
