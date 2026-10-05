import { ReceiptIndianRupee } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { isCompensationApprovalWorkflowReady, listCompensationApprovals } from "@/lib/compensation/workflow";
import { CompensationPayments } from "@/components/accounts/compensation-payments";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

export const dynamic = "force-dynamic";
export default async function AccountsApprovalsPage() {
  // Local dummy mode is a closed, disposable workspace used to test the full
  // Approvals → Accounts payment handoff. Real deployments keep the Accounts
  // department guard intact.
  if (!DUMMY_MODE) await requireAccountsAccess();
  const [workflowReady, approvalRows] = await Promise.all([isCompensationApprovalWorkflowReady(), listCompensationApprovals()]);
  const rows = approvalRows.filter((row) => row.status === "approved" && row.kind !== "attendance");
  return <><DashboardHeader generatedAt={new Date()}/><main className="w-full px-8 py-6 max-md:px-4"><div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-red-50 p-3 text-red-600"><ReceiptIndianRupee size={22}/></span><div><h1 className="text-2xl font-bold">Approved payments</h1><p className="text-sm text-slate-500">Only approved amounts appear here. Recording payment emails the employee a PDF receipt.</p></div></div>{DUMMY_MODE && <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">Local test mode: the dummy admin can record fictional payments here. Real Accounts access is unchanged.</p>}{!workflowReady && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Payment recording is unavailable until the compensation approval database migration is installed.</p>}<CompensationPayments rows={rows} workflowReady={workflowReady}/></main></>;
}
