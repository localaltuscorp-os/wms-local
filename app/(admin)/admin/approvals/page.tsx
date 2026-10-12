import { requireUser } from "@/lib/auth/current";
import { redirect } from "next/navigation";
import { canDecideCompensation, canEditCompensationApprovals, canViewCompensationApprovals, isCompensationApprovalWorkflowReady, listCompensationApprovals } from "@/lib/compensation/workflow";
import { ApprovalWorkbench } from "@/components/admin/approvals/approval-workbench";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { APPROVAL_PREVIEW_ROWS } from "@/lib/compensation/approval-preview";
import { listCtcApprovalRows, type CtcApprovalRow } from "@/lib/hr/ctc/approval-list";
import { isOnboardingApprovalWorkflowReady, listOnboardingApprovalRows, type OnboardingApprovalRow } from "@/lib/hr/onboarding/approval-list";

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
  let ctcRows: CtcApprovalRow[] = [];
  let onboardingRows: OnboardingApprovalRow[] = [];
  let onboardingWorkflowReady = false;
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
  // CTC source rows load separately so a staged CTC rollout cannot prevent the
  // rest of the approval queue from loading.
  try {
    ctcRows = await listCtcApprovalRows();
  } catch {
    ctcRows = [];
  }
  try {
    [onboardingWorkflowReady, onboardingRows] = await Promise.all([
      isOnboardingApprovalWorkflowReady(),
      listOnboardingApprovalRows(),
    ]);
  } catch {
    onboardingWorkflowReady = false;
    onboardingRows = [];
  }
  if (!preview && !DUMMY_MODE && !canView) redirect("/hub");
  return <AdminSection title="Approvals"><ApprovalWorkbench rows={preview ? APPROVAL_PREVIEW_ROWS : rows} ctcRows={ctcRows} onboardingRows={onboardingRows} canDecide={preview || DUMMY_MODE || canDecide} canDecideIncentive={preview || DUMMY_MODE || canDecide} workflowReady={preview || workflowReady} onboardingWorkflowReady={onboardingWorkflowReady} allowEdit={preview || DUMMY_MODE || allowEdit} testingMode={preview || DUMMY_MODE} preview={preview} /></AdminSection>;
}
