import { ReceiptIndianRupee } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCompensationApprovals } from "@/lib/compensation/workflow";
import { CompensationPayments } from "@/components/accounts/compensation-payments";

export const dynamic = "force-dynamic";
export default async function AccountsApprovalsPage() {
  await requireAccountsAccess();
  const rows = (await listCompensationApprovals()).filter((row) => row.status === "approved" && row.kind !== "attendance");
  return <><DashboardHeader generatedAt={new Date()}/><main className="w-full px-8 py-6 max-md:px-4"><div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-red-50 p-3 text-red-600"><ReceiptIndianRupee size={22}/></span><div><h1 className="text-2xl font-bold">Approved payments</h1><p className="text-sm text-slate-500">Only super-admin-approved amounts appear here. Recording payment emails the employee a PDF receipt.</p></div></div><CompensationPayments rows={rows}/></main></>;
}
