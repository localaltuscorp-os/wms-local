import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listMonthlyItems, listMonthlyChecks } from "@/lib/queries/accounts-monthly";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { MonthlyChecklist } from "@/components/accounts/monthly-checklist/monthly-client";
import {
  fyMonthCols,
  fyLabel,
  fyStartYearFor,
  MONTHLY_CHECK_STATUSES,
  monthlyStatusTone,
} from "@/lib/accounts/monthly";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MonthlyChecklistPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curFy = fyStartYearFor(now.getFullYear(), curMonth);

  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, checks, typeOptions, responsibleOptions, deadlineOptions, frequencyOptions] =
    await Promise.all([
      listMonthlyItems(),
      listMonthlyChecks(fyStartYear),
      listAccountsLookups("monthly_type"),
      listAccountsLookups("monthly_responsible"),
      listAccountsLookups("monthly_deadline"),
      listAccountsLookups("monthly_frequency"),
    ]);

  const cols = fyMonthCols(fyStartYear);
  const isCurrentFy = fyStartYear === curFy;
  const currentMonth = isCurrentFy ? curMonth : null;

  const prevHref = `/accounts/monthly-quarterly-annual?fy=${fyStartYear - 1}` as Route;
  const nextHref = `/accounts/monthly-quarterly-annual?fy=${fyStartYear + 1}` as Route;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} />
          Accounts Index
        </Link>

        {/* FY navigator into the action slot, as the Goals FY stepper. The
            "Apr–Mar" caption is dropped — `fyLabel` already reads "FY 2026-27",
            and the tile beside it was decoration. */}
        <PageCommandBar
          title="Quarter / Month / Annual Checklist"
          hint="Tick each month of the financial year as it's done."
          actions={
            <>
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
                <Link href={prevHref} aria-label="Previous financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronLeft size={15} strokeWidth={2.4} />
                </Link>
                <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
                  {fyLabel(fyStartYear)}
                </span>
                <Link href={nextHref} aria-label="Next financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronRight size={15} strokeWidth={2.4} />
                </Link>
              </div>
              {!isCurrentFy && (
                <Link href={"/accounts/monthly-quarterly-annual" as Route} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
                  This FY
                </Link>
              )}
            </>
          }
        />

        {/* Status legend — a quiet key, not a headline row. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {MONTHLY_CHECK_STATUSES.map((s) => {
            const t = monthlyStatusTone(s);
            return (
              <span key={s} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>
                <span className="inline-block size-[6px] rounded-full" style={{ background: t.dot }} />
                {s}
              </span>
            );
          })}
        </div>

        <MonthlyChecklist
          fyStartYear={fyStartYear}
          cols={cols}
          currentMonth={currentMonth}
          items={items}
          checks={checks}
          typeOptions={typeOptions}
          responsibleOptions={responsibleOptions}
          deadlineOptions={deadlineOptions}
          frequencyOptions={frequencyOptions}
        />
      </main>
    </>
  );
}
