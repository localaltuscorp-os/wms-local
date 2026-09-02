import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCcCards, listCcMonths, listArchivedCcCards } from "@/lib/queries/accounts-cc";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { CcMaster } from "@/components/accounts/cc-master/cc-client";
import { fyMonthCols, fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CcMasterPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curFy = fyStartYearFor(now.getFullYear(), curMonth);

  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const cols = fyMonthCols(fyStartYear);
  const isCurrentFy = fyStartYear === curFy;
  const rawM = parseInt(String(sp.m ?? ""), 10);
  const validMonth = Number.isFinite(rawM) && rawM >= 1 && rawM <= 12;
  const month = validMonth ? rawM : isCurrentFy ? curMonth : 4; // default current month, else April

  const [cards, months, entityOptions, archivedCards, prevFyCount] = await Promise.all([
    listCcCards(fyStartYear),
    listCcMonths(fyStartYear),
    listAccountsLookups("cc_entity"),
    listArchivedCcCards(fyStartYear),
    listCcCards(fyStartYear - 1).then((r) => r.length),
  ]);

  const prevHref = `/accounts/cc-tracker?fy=${fyStartYear - 1}&m=${month}` as Route;
  const nextHref = `/accounts/cc-tracker?fy=${fyStartYear + 1}&m=${month}` as Route;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} />
          Accounts Index
        </Link>

        <PageCommandBar
          title="Credit Cards Master"
          hint="Per-card statement, payment & tally tracking."
          actions={
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
          }
        />

        {/* Month chips (Apr→Mar) */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {cols.map((c) => {
            const active = c.month === month;
            const href = `/accounts/cc-tracker?fy=${fyStartYear}&m=${c.month}` as Route;
            return (
              <Link
                key={c.month}
                href={href}
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors"
                style={
                  active
                    ? { background: "var(--color-altus-red)", color: "#fff" }
                    : { background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }
                }
              >
                {c.label} &apos;{String(c.calYear % 100).padStart(2, "0")}
              </Link>
            );
          })}
        </div>

        <CcMaster
          fyStartYear={fyStartYear}
          month={month}
          cards={cards}
          months={months}
          entityOptions={entityOptions}
          archivedCards={archivedCards}
          prevFyCount={prevFyCount}
        />
      </main>
    </>
  );
}
