import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { addDays, shortDay } from "@/lib/compliance/schedule";
import { loadComplianceBoard } from "@/lib/queries/compliance-board";
import { computeComplianceDashboard } from "@/lib/compliance/dashboard";
import { ScopePicker } from "@/components/compliance/compliance-controls";
import { ComplianceDashboardView } from "@/components/compliance/dashboard/compliance-dashboard-view";

export const dynamic = "force-dynamic";

/** Employees' compliance overview; the checklist itself remains at /employees/cc. */
export default async function EmployeesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string }>;
}) {
  const me = await requireUser();
  const { who } = await searchParams;
  const today = localDateString("Asia/Kolkata");
  const from = addDays(today, -6);
  const monthKey = today.slice(0, 7);
  // Both boards share the same people/scope reads. Loading them in order avoids
  // a burst of duplicate pooler connections during an authenticated render.
  const wcc = await loadComplianceBoard({
    me,
    kind: "wcc",
    who,
    today,
    from,
    to: today,
    personalGroup: "day",
  });
  const mcc = await loadComplianceBoard({
    me,
    kind: "mcc",
    who,
    today,
    monthKeys: [monthKey],
    personalGroup: "month",
  });
  const data = computeComplianceDashboard(wcc.rows, mcc.rows);
  const monthLabel = new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString(
    "en-IN",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  return (
    <ComplianceDashboardView
      data={data}
      windowLabel={`${shortDay(from)} – ${shortDay(today)} · ${monthLabel}`}
      scopePicker={<ScopePicker picker={wcc.picker} who={wcc.who} meId={me.id} />}
      who={wcc.who}
    />
  );
}
