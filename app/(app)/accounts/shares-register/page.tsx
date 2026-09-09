import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listShares } from "@/lib/queries/accounts-shares";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { SharesRegister } from "@/components/accounts/shares-register/shares-client";

export const dynamic = "force-dynamic";

export default async function SharesRegisterPage() {
  await requireAccountsAccess();
  const [rows, entityOptions] = await Promise.all([
    listShares(),
    listAccountsLookups("shares_entity"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} /> Accounts Index
        </Link>
        <PageCommandBar title="Shares Register" hint="Shareholdings & transactions per entity — quantity, rate, value and folio/demat." />
        <SharesRegister rows={rows} entityOptions={entityOptions} />
      </main>
    </>
  );
}
