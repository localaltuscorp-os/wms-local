import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listBankItems, listBankWeeks, listBankBalances } from "@/lib/queries/accounts-bank";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { BankBalance } from "@/components/accounts/bank-balance/bank-client";
import { fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BankBalancePage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, weeks, balances, entityOptions] = await Promise.all([
    listBankItems(fyStartYear),
    listBankWeeks(fyStartYear),
    listBankBalances(fyStartYear),
    listAccountsLookups("bank_entity"),
  ]);

  const isCurrentFy = fyStartYear === curFy;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} /> Accounts Index
        </Link>

        <PageCommandBar
          title="Bank Balance Tracker"
          actions={
            <>
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
                <Link href={`/accounts/bank-balance?fy=${fyStartYear - 1}` as Route} aria-label="Previous financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronLeft size={15} strokeWidth={2.4} />
                </Link>
                <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
                  {fyLabel(fyStartYear)}
                </span>
                <Link href={`/accounts/bank-balance?fy=${fyStartYear + 1}` as Route} aria-label="Next financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronRight size={15} strokeWidth={2.4} />
                </Link>
              </div>
              {!isCurrentFy && (
                <Link href={"/accounts/bank-balance" as Route} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">This FY</Link>
              )}
            </>
          }
        />


        <BankBalance
          fyStartYear={fyStartYear}
          items={items}
          weeks={weeks}
          balances={balances}
          entityOptions={entityOptions}
        />
      </main>
    </>
  );
}
