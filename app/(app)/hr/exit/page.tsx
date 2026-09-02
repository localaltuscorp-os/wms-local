import { requireHrStaff } from "@/lib/hr/access";
import { listExitRecords, listExitRoster } from "@/app/(app)/hr/exit/exit-actions";
import { ExitWorkspace } from "@/components/hr/exit/exit-workspace";

export const dynamic = "force-dynamic";

/**
 * Employee Lifecycle → Exit. Full-screen HR workspace offering BOTH exit forms
 * (Exit Interview Questionnaire · Handover & Clearance Checklist) for a selected
 * departing employee. Records persist to `exit_records` (migration 0160) and
 * autosave; re-opening a form resumes the saved version.
 */
export default async function ExitPage() {
  await requireHrStaff();
  const [employees, recent] = await Promise.all([
    listExitRoster().catch(() => []),
    listExitRecords().catch(() => []),
  ]);
  return <ExitWorkspace employees={employees} recent={recent} />;
}
