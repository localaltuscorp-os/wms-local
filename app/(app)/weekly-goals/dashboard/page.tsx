import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { WeeklyGoalsDashboard } from "@/components/weekly-goals/weekly-goals-dashboard";
import { requireUser } from "@/lib/auth/current";
import {
  employeeRankings,
  performerOf,
  globalStarOf,
  weekWiseTrend,
} from "@/lib/queries/weekly-goals";

export const dynamic = "force-dynamic";

export default async function WeeklyGoalsDashboardPage() {
  const me = await requireUser();

  // Non-admins see the same leaderboard but their own trend line; admins see
  // the org-wide trend. Rankings are always org-wide (it's a leaderboard).
  const [
    trend,
    weekRanks,
    monthRanks,
    yearRanks,
    performerWeek,
    performerMonth,
    performerYear,
    starMonth,
  ] = await Promise.all([
    weekWiseTrend({ weeks: 8, employeeId: me.isAdmin ? undefined : me.id }),
    employeeRankings("week"),
    employeeRankings("month"),
    employeeRankings("year"),
    performerOf("week"),
    performerOf("month"),
    performerOf("year"),
    globalStarOf("month"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <WeeklyGoalsDashboard
        trend={trend}
        trendScope={me.isAdmin ? "Team" : "Your"}
        rankings={{ week: weekRanks, month: monthRanks, year: yearRanks }}
        performers={{ week: performerWeek, month: performerMonth, year: performerYear }}
        starOfMonth={starMonth}
        myId={me.id}
      />
      <DashboardFooter />
    </>
  );
}
