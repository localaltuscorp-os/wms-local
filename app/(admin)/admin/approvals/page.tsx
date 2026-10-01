import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { redirect } from "next/navigation";
import { listCompensationApprovals } from "@/lib/compensation/workflow";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { ApprovalWorkbench } from "@/components/admin/approvals/approval-workbench";

export const dynamic = "force-dynamic";
export default async function ApprovalsPage() {
  const me = await requireUser(); if (!isSuperAdmin(me.email)) redirect("/hub");
  const rows = await listCompensationApprovals();
  return <AdminSection title="Approvals" subtitle="Approve each employee's attendance, incentive, reimbursement, and salary item before Accounts can pay." icon={ShieldCheck} stats={[{ label: "Pending", value: rows.filter((r) => r.status === "pending").length }, { label: "Approved", value: rows.filter((r) => r.status === "approved").length }]}><ApprovalWorkbench rows={rows}/></AdminSection>;
}
