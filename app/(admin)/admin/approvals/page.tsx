import { requireUser } from "@/lib/auth/current";
import { redirect } from "next/navigation";
import { canDecideCompensation, canEditCompensationApprovals, canViewCompensationApprovals, isCompensationApprovalWorkflowReady, listCompensationApprovals } from "@/lib/compensation/workflow";
import { ApprovalWorkbench } from "@/components/admin/approvals/approval-workbench";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { AdminSection } from "@/components/admin/ui/section-shell";

export const dynamic = "force-dynamic";
export default async function ApprovalsPage() {
  const me = await requireUser();
  const [canView, canDecide, allowEdit] = await Promise.all([
    canViewCompensationApprovals(me),
    canDecideCompensation(me),
    canEditCompensationApprovals(me),
  ]);
  if (!canView) redirect("/hub");
  const [workflowReady, rows] = await Promise.all([isCompensationApprovalWorkflowReady(), listCompensationApprovals()]);
  return <AdminSection title="Approvals"><ApprovalWorkbench rows={rows} canDecide={canDecide} canDecideIncentive={canDecide} workflowReady={workflowReady} allowEdit={allowEdit} testingMode={DUMMY_MODE}/></AdminSection>;
}
