import { CalendarRange } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { localDateString } from "@/lib/format";
import { monthsOfQuarterKey, quarterKeyOfMonthKey } from "@/lib/goals/types";
import { loadComplianceBoard } from "@/lib/queries/compliance-board";
import { ComplianceBoard } from "@/components/compliance/compliance-board";
import { MccPeriodBar, ScopePicker } from "@/components/compliance/compliance-controls";

export const dynamic = "force-dynamic";

/**
 * EMPLOYEES → MCC — the Monthly Compliance Checklist (account holder, 2026-09-18).
 *
 * The same table as WCC, over months — each compliance on its own frequency:
 * Monthly, 2 times/month, 3 times/month, Alternate Month, Quarterly, Half
 * Yearly or Annually (lib/compliance/mcc-frequency.ts). The CURRENT MONTH by default, with a
 * compact switcher — ‹ September 2026 ▾ › — to step to a past or future one
 * or pick it (`?m=YYYY-MM`), and a Quarter view that shows a quarter's three
 * months together, Q1 to Q4 of a financial year (`?view=quarter&q=2026-Q2`).
 * The period is named in the switcher, so the header carries no subtitle
 * (account holder, 2026-09-19).
 */
export default async function MccPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; m?: string; q?: string; who?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = localDateString("Asia/Kolkata");
  const currentMonth = today.slice(0, 7);
  const view = sp.view === "quarter" ? "quarter" : "month";
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : currentMonth;
  const quarterKey = /^\d{4}-Q[1-4]$/.test(sp.q ?? "") ? sp.q! : quarterKeyOfMonthKey(currentMonth);
  const monthKeys = view === "month" ? [monthKey] : monthsOfQuarterKey(quarterKey);

  const board = await loadComplianceBoard({
    me,
    kind: "mcc",
    who: sp.who,
    today,
    monthKeys,
    personalGroup: "month",
  });

  return (
    <PageShell>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#FEE2E2", color: "#A80400" }}>
          <CalendarRange className="h-5 w-5" />
        </span>
        <h1 className="mr-auto min-w-0 text-[22px] font-black tracking-tight text-ink-strong">MCC — Monthly Compliance Checklist</h1>
        <ScopePicker picker={board.picker} who={board.who} meId={me.id} />
      </header>

      <div className="mb-4">
        <MccPeriodBar view={view} monthKey={monthKey} quarterKey={quarterKey} currentMonthKey={currentMonth} />
      </div>

      <ComplianceBoard
        kind="mcc"
        rows={board.rows}
        groups={board.groups}
        multiPerson={board.multiPerson}
        manageable={board.manageable}
        defaultOwnerId={board.who === "me" || board.who === "team" ? me.id : board.who}
        today={today}
        viewerId={me.id}
      />
    </PageShell>
  );
}
