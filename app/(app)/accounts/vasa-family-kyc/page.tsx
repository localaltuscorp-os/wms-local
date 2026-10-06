import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listKycDocuments } from "@/lib/queries/accounts-kyc";
import { KycDocuments } from "@/components/accounts/vasa-family-kyc/kyc-client";

export const dynamic = "force-dynamic";

export default async function VasaFamilyKycPage() {
  await requireAccountsAccess();
  const rows = await listKycDocuments();
  return <><DashboardHeader generatedAt={new Date()} /><main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6"><Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={14} /> Accounts Index</Link><PageCommandBar title="Vasa Family KYC Documents" hint="PAN, Aadhaar, passport and bank proof records with issue and expiry dates." /><KycDocuments rows={rows} /></main></>;
}
