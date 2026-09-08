import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isHrStaff } from "@/lib/hr/access";
import { HrConsoleHome } from "@/components/hr/console/hr-console-home";

export const dynamic = "force-dynamic";

/**
 * HR front door. The room's navigation lives in the surrounding three-column
 * console (app/(app)/hr/layout.tsx), so this route only fills the content
 * column — a short orientation pane, plus the all-policies sheet for
 * /hr?policies=1.
 */
export default async function HrHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  const me = await requireWorkspace("hr");
  const staff = await isHrStaff(me);
  return <HrConsoleHome isHrStaff={staff} />;
}
