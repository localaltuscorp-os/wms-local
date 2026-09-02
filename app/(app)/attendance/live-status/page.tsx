import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAdmin } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { loadLiveStatus } from "@/lib/attendance/analytics/live-status";
import { LiveStatusPanel } from "@/components/attendance/live-status-panel";
import { localDateString } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * LIVE STATUS — "who's where right now", as its own tab.
 *
 * The panel itself is unchanged; only where you reach it moved. It used to sit
 * in the right rail of the attendance home, which put a whole-team snapshot on
 * the page an individual goes to in order to clock in — two audiences, one
 * screen. It now has its own door, and the attendance page keeps only what the
 * person standing in front of it needs.
 *
 * ADMIN-ONLY, as it was in the rail: the counts span the whole roster. The nav
 * entry is hidden for everyone else and this guard is what actually enforces it.
 */
export default async function LiveStatusPage() {
  const me = await requireAdmin();
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  const org = await getOrgSettings();
  const status = await loadLiveStatus(today, tz, {
    lateAfter: org?.attLateAfter ?? null,
    earlyBefore: org?.attEarlyBefore ?? null,
  });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="narrow">
        <PageCommandBar
          title="Live Status"
          hint="Who is checked in, late, early out or away — right now."
        />
        <LiveStatusPanel status={status} />
      </PageShell>
    </>
  );
}
