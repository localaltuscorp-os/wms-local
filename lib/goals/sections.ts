import {
  Target,
  ListChecks,
  ClipboardList,
  CalendarCheck,
  CalendarRange,
  Upload,
  type LucideIcon,
} from "lucide-react";

/**
 * Data-driven registry for the Goals workspace sub-hub (`/goals`). Reorder / add
 * surfaces by editing this one array — the hub landing reads from it. `adminOnly`
 * cards are hidden from non-admin viewers (the whole room is otherwise open).
 */
export interface GoalsSection {
  /** URL path under the goals workspace, e.g. '/goals/weekly'. */
  href: string;
  order: number;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  adminOnly?: boolean;
}

export const GOALS_SECTIONS: GoalsSection[] = [
  {
    href: "/goals/cascade",
    order: 1,
    title: "The Cascade",
    blurb:
      "Sir's yearly-goal sheet, live — Year → Quarter → Month → Week. Auto-divide targets, cross-out what you drop, add extras and carry unfinished goals forward.",
    Icon: Target,
  },
  {
    href: "/goals/weekly",
    order: 2,
    title: "Weekly Board",
    blurb:
      "This week's priorities linked up to their monthly goal — the mature weekly engine, now showing area, targets, team and month linkage.",
    Icon: ListChecks,
  },
  // "Plan Your Day" removed (2026-08): the planner moved out of this room to
  // WMS › Plan My Day (`/my-day`), so it is no longer a Goals surface and does
  // not belong on the Goals hub. `order: 3` is deliberately left as a gap —
  // these are sort keys, not indices.
  {
    href: "/goals/commit",
    order: 4,
    title: "Saturday Commit",
    blurb:
      "Fill this week's progress and freeze next week's committed goals — the Saturday sign-out ritual.",
    Icon: CalendarCheck,
  },
  {
    href: "/goals/approve",
    order: 5,
    title: "Monday Approve",
    blurb:
      "Managers review each downline member's last-week progress and this-week commitments, then approve.",
    Icon: CalendarRange,
  },
  {
    href: "/goals/review",
    order: 6,
    title: "Review & Scores",
    blurb:
      "Dual-rating across every level — self vs manager %, week / month / YTD roll-ups and the colour scorecard.",
    Icon: ClipboardList,
  },
  {
    href: "/goals/import",
    order: 7,
    title: "Bulk Import",
    blurb:
      "Fan goals across the team from a spreadsheet — Area / Goal / UOM / Target / Team / Period / Parent.",
    Icon: Upload,
    adminOnly: true,
  },
];
