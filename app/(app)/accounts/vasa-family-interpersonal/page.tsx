import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listVasaCells, listVasaSnapshots } from "@/lib/queries/accounts-vasa";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { VasaBalances } from "@/components/accounts/vasa-family/vasa-client";

export const dynamic = "force-dynamic";

export default async function VasaFamilyPage() {
  await requireAccountsAccess();
  const [cells, snapshots, partyOptions] = await Promise.all([
    listVasaCells(),
    listVasaSnapshots(),
    listAccountsLookups("vasa_party"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={14} strokeWidth={2.4} /> Accounts Index
        </Link>
        {/* The header bar is rendered INSIDE VasaBalances, not here: its
            right-hand slot holds the New Chart button, which needs the client
            component's create handler. Rendering it in both places would put a
            second New Chart button on the screen. */}
        <VasaBalances cells={cells} snapshots={snapshots} partyOptions={partyOptions} />
      </main>
    </>
  );
}
