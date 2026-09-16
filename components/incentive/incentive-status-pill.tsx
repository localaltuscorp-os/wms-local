import { INCENTIVE_STATUS_LABELS, type IncentiveStatus } from "@/db/enums";

/**
 * The one colour map for incentive request states, shared by the list, the
 * history timeline and the decision panel so a state never reads differently
 * on two parts of the same screen.
 *
 * Deep text on a light tint, per state: green for the two good outcomes, red
 * for the two stops, amber for "waiting on someone", slate for the settled
 * in-between states.
 */
export const INCENTIVE_STATUS_STYLE: Record<IncentiveStatus, { bg: string; fg: string }> = {
  pending:            { bg: "rgba(245,158,11,0.12)", fg: "#B45309" },
  approved:           { bg: "rgba(22,163,74,0.12)",  fg: "#15803D" },
  rejected:           { bg: "rgba(225,6,0,0.10)",    fg: "#A80400" },
  due:                { bg: "rgba(37,99,235,0.10)",  fg: "#1D4ED8" },
  not_due:            { bg: "rgba(100,116,139,0.14)", fg: "#334155" },
  reversed:           { bg: "rgba(225,6,0,0.10)",    fg: "#7F1D1D" },
  revision_requested: { bg: "rgba(245,158,11,0.14)", fg: "#92400E" },
};

const FALLBACK = { bg: "rgba(100,116,139,0.12)", fg: "#334155" };

export function IncentiveStatusPill({ status }: { status: IncentiveStatus | string }) {
  // A state not in the map (legacy/imported) must render, not crash the list.
  const style = INCENTIVE_STATUS_STYLE[status as IncentiveStatus] ?? FALLBACK;
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12px] font-bold whitespace-nowrap"
      style={{ background: style.bg, color: style.fg }}
    >
      {INCENTIVE_STATUS_LABELS[status as IncentiveStatus] ?? status}
    </span>
  );
}
