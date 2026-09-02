import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listItFolders } from "@/lib/queries/accounts-it";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { ItMasterFolder } from "@/components/accounts/income-tax/it-client";

export const dynamic = "force-dynamic";

export default async function ItMasterFolderPage() {
  await requireAccountsAccess();
  const [rows, entityOptions] = await Promise.all([
    listItFolders(),
    listAccountsLookups("it_entity"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} /> Accounts Index
        </Link>
        <PageCommandBar title="Income Tax Master Folder" hint="Income-tax record folders for the last 3–5 years, per entity." />
        <ItMasterFolder rows={rows} entityOptions={entityOptions} />
      </main>
    </>
  );
}
