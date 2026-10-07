import { requireUser } from "@/lib/auth/current";
import { redirect } from "next/navigation";
import { canDecideCompensation, canEditCompensationApprovals, canViewCompensationApprovals, isCompensationApprovalWorkflowReady, listCompensationApprovals } from "@/lib/compensation/workflow";
import { ApprovalWorkbench } from "@/components/admin/approvals/approval-workbench";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { APPROVAL_PREVIEW_ROWS } from "@/lib/compensation/approval-preview";

export const dynamic = "force-dynamic";
export default async function ApprovalsPage() {
  const me = await requireUser();
  const canUsePreview = process.env.NODE_ENV === "development";
  let canView = false;
  let canDecide = false;
  let allowEdit = false;
  let workflowReady = false;
  let rows = APPROVAL_PREVIEW_ROWS;
  let preview = false;
  try {
    const result = await Promise.all([
      canViewCompensationApprovals(me),
      canDecideCompensation(me),
      canEditCompensationApprovals(me),
      isCompensationApprovalWorkflowReady(),
      listCompensationApprovals(),
    ]);
    [canView, canDecide, allowEdit, workflowReady, rows] = result;
    preview = canUsePreview && (!canView || rows.length === 0);
  } catch (error) {
    if (!canUsePreview) throw error;
    preview = true;
  }
  if (!preview && !DUMMY_MODE && !canView) redirect("/hub");
  return <AdminSection title="Approvals"><ApprovalWorkbench rows={preview ? APPROVAL_PREVIEW_ROWS : rows} canDecide={preview || DUMMY_MODE || canDecide} canDecideIncentive={preview || DUMMY_MODE || canDecide} workflowReady={preview || workflowReady} allowEdit={preview || DUMMY_MODE || allowEdit} testingMode={preview || DUMMY_MODE} preview={preview} /></AdminSection>;
}
