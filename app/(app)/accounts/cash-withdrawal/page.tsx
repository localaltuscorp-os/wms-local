import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCashItems, listCashMonths, listCashLimits } from "@/lib/queries/accounts-cash";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { CashWithdrawal } from "@/components/accounts/cash-withdrawal/cash-client";
import { fyMonthCols, fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CashWithdrawalPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, months, limits, entityOptions, payeeOptions] = await Promise.all([
    listCashItems(fyStartYear),
    listCashMonths(fyStartYear),
    listCashLimits(fyStartYear),
    listAccountsLookups("cash_entity"),
    listAccountsLookups("cash_payee"),
  ]);

  const cols = fyMonthCols(fyStartYear);
  const isCurrentFy = fyStartYear === curFy;
  const currentMonth = isCurrentFy ? now.getMonth() + 1 : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} /> Accounts Index
        </Link>

        <PageCommandBar
          title="Cash Withdrawal Tracker"
          actions={
            <>
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
                <Link href={`/accounts/cash-withdrawal?fy=${fyStartYear - 1}` as Route} aria-label="Previous financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronLeft size={15} strokeWidth={2.4} />
                </Link>
                <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
                  {fyLabel(fyStartYear)}
                </span>
                <Link href={`/accounts/cash-withdrawal?fy=${fyStartYear + 1}` as Route} aria-label="Next financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronRight size={15} strokeWidth={2.4} />
                </Link>
              </div>
              {!isCurrentFy && (
                <Link href={"/accounts/cash-withdrawal" as Route} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">This FY</Link>
              )}
            </>
          }
        />


        <CashWithdrawal
          fyStartYear={fyStartYear}
          cols={cols}
          currentMonth={currentMonth}
          items={items}
          months={months}
          limits={limits}
          entityOptions={entityOptions}
          payeeOptions={payeeOptions}
        />
      </main>
    </>
  );
}
