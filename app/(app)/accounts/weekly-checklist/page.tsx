import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listWeeklyItems, listWeeklyChecks } from "@/lib/queries/accounts-weekly";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { WeeklyChecklist } from "@/components/accounts/weekly-checklist/weekly-client";
import {
  weeksOfMonth,
  weekNoForDay,
  MONTH_LABELS,
  WEEKLY_CHECK_STATUSES,
  weeklyStatusTone,
} from "@/lib/accounts/weekly";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function clampMonth(y: number, m: number): { y: number; m: number } {
  // m is 1-based; normalise overflow/underflow into adjacent years.
  let year = y;
  let month = m;
  while (month < 1) { month += 12; year -= 1; }
  while (month > 12) { month -= 12; year += 1; }
  return { y: year, m: month };
}

export default async function WeeklyChecklistPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  const rawY = parseInt(String(sp.y ?? ""), 10);
  const rawM = parseInt(String(sp.m ?? ""), 10);
  const year = Number.isFinite(rawY) ? rawY : curY;
  const month = Number.isFinite(rawM) && rawM >= 1 && rawM <= 12 ? rawM : curM;

  const [items, checks, deadlineOptions, categoryOptions, responsibleOptions, frequencyOptions] =
    await Promise.all([
      listWeeklyItems(),
      listWeeklyChecks(year, month),
      listAccountsLookups("weekly_deadline"),
      listAccountsLookups("weekly_category"),
      listAccountsLookups("weekly_responsible"),
      listAccountsLookups("weekly_frequency"),
    ]);

  const weeks = weeksOfMonth(year, month);
  const isCurrentMonth = year === curY && month === curM;
  const currentWeekNo = isCurrentMonth ? weekNoForDay(now.getDate()) : null;

  const prev = clampMonth(year, month - 1);
  const next = clampMonth(year, month + 1);
  const prevHref = `/accounts/weekly-checklist?y=${prev.y}&m=${prev.m}` as Route;
  const nextHref = `/accounts/weekly-checklist?y=${next.y}&m=${next.m}` as Route;
  const monthLabel = `${MONTH_LABELS[month - 1]} ${year}`;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} />
          Accounts Index
        </Link>

        {/* Month navigator moves INTO the bar's action slot, in the same
            bordered stepper the Goals FY picker uses — it is the page's period
            control, which is exactly what that slot is for. The 36px calendar
            tile and the separate "This month · Wk3" line are gone: the tile was
            decoration and the week number now rides on the stepper label. */}
        <PageCommandBar
          title="Weekly Checklist"
          hint="Recurring weekly compliance — tick each week of the month as it's done."
          actions={
            <>
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
                <Link href={prevHref} aria-label="Previous month" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronLeft size={15} strokeWidth={2.4} />
                </Link>
                <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
                  {monthLabel}
                  {isCurrentMonth && <span className="ml-1 text-altus-red">· Wk{currentWeekNo}</span>}
                </span>
                <Link href={nextHref} aria-label="Next month" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronRight size={15} strokeWidth={2.4} />
                </Link>
              </div>
              {!isCurrentMonth && (
                <Link href={"/accounts/weekly-checklist" as Route} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
                  Today
                </Link>
              )}
            </>
          }
        />

        {/* Status legend — a quiet key, not a headline row. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {WEEKLY_CHECK_STATUSES.map((s) => {
            const t = weeklyStatusTone(s);
            return (
              <span key={s} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>
                <span className="inline-block size-[6px] rounded-full" style={{ background: t.dot }} />
                {s}
              </span>
            );
          })}
        </div>

        <WeeklyChecklist
          year={year}
          month={month}
          weeks={weeks}
          currentWeekNo={currentWeekNo}
          items={items}
          checks={checks}
          deadlineOptions={deadlineOptions}
          categoryOptions={categoryOptions}
          responsibleOptions={responsibleOptions}
          frequencyOptions={frequencyOptions}
        />
      </main>
    </>
  );
}
