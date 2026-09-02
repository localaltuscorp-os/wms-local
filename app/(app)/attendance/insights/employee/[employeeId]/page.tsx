import { redirect } from "next/navigation";
import type { Route } from "next";
import { FileWarning, UserRoundX } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";
import { isFinanceViewer } from "@/lib/auth/finance-access";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { localDateString } from "@/lib/format";
import {
  loadEmployeeAttendanceAnalytics,
  type EmployeeAttendanceAnalytics,
} from "@/lib/attendance/analytics/employee";
import { EmployeeAttendanceDashboard } from "@/components/attendance/insights/employee/employee-dashboard";

export const dynamic = "force-dynamic";

/** Reporting timezone for the live-row "today" anchor. */
const DEFAULT_TZ = "Asia/Kolkata";

interface PageProps {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Parse `?y=&m=`; fall back to the current month in the reporting tz. */
function resolveMonth(
  sp: Record<string, string | string[] | undefined>,
  todayISO: string,
): { year: number; month: number } {
  const [cy, cm] = todayISO.split("-").map(Number);
  const rawY = typeof sp.y === "string" ? Number(sp.y) : NaN;
  const rawM = typeof sp.m === "string" ? Number(sp.m) : NaN;
  const year =
    Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month =
    Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

/**
 * Per-employee attendance dashboard.
 *
 * Access: the employee themselves (self), a manager anywhere up their reporting
 * chain, HR staff, finance viewers (Accounts), admins and super-admins. Everyone
 * else is bounced to the hub.
 */
export default async function EmployeeAttendanceInsightsPage({
  params,
  searchParams,
}: PageProps) {
  const [{ employeeId }, sp] = await Promise.all([params, searchParams]);
  const me = await requireUser();

  const allowed =
    me.id === employeeId ||
    me.isAdmin ||
    isSuperAdmin(me.email) ||
    (await isHrStaff(me)) ||
    (await isFinanceViewer(me)) ||
    (await getDownlineIds(me.id)).includes(employeeId);

  if (!allowed) redirect("/hub" as Route);

  const todayISO = localDateString(DEFAULT_TZ);
  const { year, month } = resolveMonth(sp, todayISO);

  let data: EmployeeAttendanceAnalytics | null = null;
  let loadError = false;
  try {
    data = await loadEmployeeAttendanceAnalytics(employeeId, year, month, todayISO);
  } catch (err) {
    console.error("[attendance/insights/employee] load failed", err);
    loadError = true;
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        {loadError ? (
          <StateCard
            icon={<FileWarning size={26} strokeWidth={2.2} />}
            title="Could not load this attendance dashboard."
            body="Something went wrong fetching the numbers. Please refresh in a moment."
          />
        ) : data?.notFound ? (
          <StateCard
            icon={<UserRoundX size={26} strokeWidth={2.2} />}
            title="Employee Not Found"
            body="This person no longer exists or the link is stale. Head back and pick a teammate from the list."
          />
        ) : data ? (
          <EmployeeAttendanceDashboard data={data} />
        ) : null}
      </PageShell>
    </>
  );
}

function StateCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card px-8 py-16 text-center"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
      }}
    >
      <span
        className="mx-auto mb-4 inline-grid size-14 place-items-center rounded-2xl"
        style={{ background: "color-mix(in srgb, #E10600 9%, transparent)", color: "#A80400" }}
      >
        {icon}
      </span>
      <h2
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 23,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-[52ch] text-[15px] font-medium text-ink-muted">{body}</p>
    </section>
  );
}
