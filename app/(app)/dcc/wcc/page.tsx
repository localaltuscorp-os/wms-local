import { CalendarCheck2 } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { localDateString } from "@/lib/format";
import { wccWindow } from "@/lib/compliance/schedule";
import { wccPeriodColumns } from "@/lib/compliance/period-checks";
import { loadCompliancePeriodChecks } from "@/lib/queries/compliance-period-checks";
import { loadComplianceBoard } from "@/lib/queries/compliance-board";
import { ComplianceBoard } from "@/components/compliance/compliance-board";
import { ScopePicker, WccViewBar } from "@/components/compliance/compliance-controls";

export const dynamic = "force-dynamic";

/**
 * EMPLOYEES → WCC — the Weekly Compliance Checklist (account holder, 2026-09-18).
 *
 * DCC rebuilt the Accounts way: one row per compliance per deadline, the WMS
 * Doer Status, the actual date against the deadline, the +/- days, Doer Notes,
 * and the Approver Status with its notes.
 *
 * ONLY THREE VIEWS: Today, the last 3 days, the last 6 days (`?days=`), with
 * arrows to walk the window back (`?end=`). A weekly compliance still open this
 * week shows from the first day it can be done.
 *
 * `?who=` — only mine (default), `team`, or one person's; see
 * lib/queries/compliance-board.ts.
 */
export default async function WccPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; end?: string; who?: string; status?: string; find?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = localDateString("Asia/Kolkata");
  const days = (sp.days === "3" ? 3 : sp.days === "6" ? 6 : 1) as 1 | 3 | 6;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(sp.end ?? "") && sp.end! < today ? sp.end! : today;
  const { from, to } = wccWindow(end, days);

  const board = await loadComplianceBoard({
    me,
    kind: "wcc",
    who: sp.who,
    today,
    from,
    to,
    personalGroup: "day",
  });
  const periodColumns = wccPeriodColumns(today);
  const periodChecks = await loadCompliancePeriodChecks(board.itemIds, "wcc", periodColumns[0]?.periodYear ?? Number(today.slice(0, 4)));

  return (
    <PageShell>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#FEE2E2", color: "#A80400" }}>
          <CalendarCheck2 className="h-5 w-5" />
        </span>
        <h1 className="mr-auto min-w-0 text-[22px] font-black tracking-tight text-ink-strong">WCC — Weekly Compliance Checklist</h1>
        <ScopePicker picker={board.picker} who={board.who} meId={me.id} />
      </header>

      <div className="mb-4">
        <WccViewBar days={days} end={end} today={today} />
      </div>

      <ComplianceBoard
        kind="wcc"
        rows={board.rows}
        groups={board.groups}
        multiPerson={board.multiPerson}
        manageable={board.manageable}
        defaultOwnerId={board.who === "me" || board.who === "team" ? me.id : board.who}
        today={today}
        viewerId={me.id}
        /* Deep links from the Compliance Dashboard: a figure you click opens
           this board already showing exactly the rows behind it. */
        initialStatuses={sp.status ? sp.status.split(",") : undefined}
        initialQuery={sp.find}
        periodColumns={periodColumns}
        periodChecks={periodChecks}
      />
    </PageShell>
  );
}
