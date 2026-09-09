import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listDueItems } from "@/lib/queries/accounts-due";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { DueDatesChecklist } from "@/components/accounts/due-dates/due-dates-client";

export const dynamic = "force-dynamic";

export default async function DueDatesPage() {
  await requireAccountsAccess();

  const [items, areaOptions, frequencyOptions] = await Promise.all([
    listDueItems(),
    listAccountsLookups("due_area"),
    listAccountsLookups("due_frequency"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} />
          Accounts Index
        </Link>

        <PageCommandBar
          title="Due Dates Checklist"
          hint="Recurring bills & statutory items by area — frequency, period, due date and status."
        />

        <DueDatesChecklist items={items} areaOptions={areaOptions} frequencyOptions={frequencyOptions} />
      </main>
    </>
  );
}
