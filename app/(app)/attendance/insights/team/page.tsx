import type { Route } from "next";
import Link from "next/link";
import { Users2, UserRoundX } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { loadManagerTeamAnalytics } from "@/lib/attendance/analytics/manager";
import { TeamAttendanceDashboard } from "@/components/attendance/insights/manager/team-dashboard";

export const dynamic = "force-dynamic";

/** Default reporting timezone — "today" for live-row grading. */
const DEFAULT_TZ = "Asia/Kolkata";

interface PageProps {
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
  const year = Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month = Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

export default async function TeamAttendanceInsightsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Any signed-in user with a non-empty downline may view their team.
  const me = await requireUser();

  const todayISO = localDateString(DEFAULT_TZ);
  const { year, month } = resolveMonth(sp, todayISO);

  let data: Awaited<ReturnType<typeof loadManagerTeamAnalytics>> | null = null;
  let loadError = false;
  try {
    data = await loadManagerTeamAnalytics(me.id, year, month, todayISO);
  } catch (err) {
    console.error("[attendance/insights/team] load failed", err);
    loadError = true;
  }

  const monthTitle = data?.monthLabel ?? "";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        {/* ── Glass hero band ─────────────────────────────────────────── */}
        <section className="admin-section-band wg-rise mb-6 px-8 py-7 max-md:px-5 max-md:py-5">
          <div className="relative flex items-start gap-4 min-w-0">
            <span className="admin-section-icon size-12 shrink-0 max-md:hidden">
              <Users2 size={24} strokeWidth={2.2} aria-hidden />
            </span>
            <div className="min-w-0">
              <div
                className="uppercase font-bold text-ink-subtle"
                style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace", fontSize: 11, letterSpacing: "0.18em" }}
              >
                Manager · Team attendance
              </div>
              <h1
                className="mt-1 text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                My Team{monthTitle ? ` · ${monthTitle}` : ""}
              </h1>
              <p className="mt-2 text-[15px] font-medium text-ink-muted">
                Attendance, punctuality &amp; productivity across your direct and
                indirect reports. Open any member for their full record.
              </p>
            </div>
          </div>
        </section>

        {loadError ? (
          <ErrorState />
        ) : data && data.empty ? (
          <NoReportsState />
        ) : data ? (
          <TeamAttendanceDashboard data={data} />
        ) : (
          <ErrorState />
        )}
      </PageShell>
    </>
  );
}

function ErrorState() {
  return (
    <div className="rounded-section bg-surface-card border border-hairline p-10 text-center" style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}>
      <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>Could not load your team dashboard.</p>
      <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>Please refresh in a moment.</p>
    </div>
  );
}

function NoReportsState() {
  return (
    <div className="rounded-section bg-surface-card border border-hairline p-12 text-center flex flex-col items-center gap-4" style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}>
      <span className="inline-flex size-16 items-center justify-center rounded-2xl" style={{ background: "rgba(15,23,42,0.05)", color: "var(--color-ink-soft)" }}>
        <UserRoundX size={30} strokeWidth={2} aria-hidden />
      </span>
      <div>
        <p className="font-bold text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 20 }}>
          No Direct Reports Yet
        </p>
        <p className="mt-2 font-medium text-ink-muted mx-auto max-w-md" style={{ fontSize: 15 }}>
          This team dashboard appears once people report to you. In the meantime,
          you can review your own attendance record.
        </p>
      </div>
      <Link
        href={"/attendance" as Route}
        className="pastel-cta inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-bold"
      >
        Go to My Attendance
      </Link>
    </div>
  );
}
