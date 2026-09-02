import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listFnoItems, listFnoMonths } from "@/lib/queries/accounts-fno";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { FnoIncome } from "@/components/accounts/fno-income/fno-client";
import { fyMonthCols, fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FnoIncomePage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, months, entityOptions, agencyOptions] = await Promise.all([
    listFnoItems(fyStartYear),
    listFnoMonths(fyStartYear),
    listAccountsLookups("fno_entity"),
    listAccountsLookups("fno_agency"),
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
          title="FNO Income Master"
          actions={
            <>
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
                <Link href={`/accounts/fno-income?fy=${fyStartYear - 1}` as Route} aria-label="Previous financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronLeft size={15} strokeWidth={2.4} />
                </Link>
                <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
                  {fyLabel(fyStartYear)}
                </span>
                <Link href={`/accounts/fno-income?fy=${fyStartYear + 1}` as Route} aria-label="Next financial year" className="px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red">
                  <ChevronRight size={15} strokeWidth={2.4} />
                </Link>
              </div>
              {!isCurrentFy && (
                <Link href={"/accounts/fno-income" as Route} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">This FY</Link>
              )}
            </>
          }
        />


        <FnoIncome
          fyStartYear={fyStartYear}
          cols={cols}
          currentMonth={currentMonth}
          items={items}
          months={months}
          entityOptions={entityOptions}
          agencyOptions={agencyOptions}
        />
      </main>
    </>
  );
}
