import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isHrStaff } from "@/lib/hr/access";
import { HrLanding } from "@/components/hr/hr-landing";

export const dynamic = "force-dynamic";

/**
 * HR front door — a premium, light-theme, animated welcome (see HrLanding):
 * a "Welcome to HR" hero over a soft aurora with a self-hosted welcome
 * animation, then the employee journey as a fanned 3D card deck — the five
 * lifecycle stages plus Holiday List and Help Desk (seven cards).
 */
export default async function HrHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod. The
  // HR workspace is open to every employee; full staff (super-admins + the "HR"
  // department) see the whole deck, everyone else gets the limited 3-card view.
  const me = await requireWorkspace("hr");
  const staff = await isHrStaff(me);
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrLanding isHrStaff={staff} />
    </>
  );
}
