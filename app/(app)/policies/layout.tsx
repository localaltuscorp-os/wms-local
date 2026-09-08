import { Suspense, type ReactNode } from "react";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrConsoleShell } from "@/components/hr/console/hr-console-shell";

/**
 * Policies is an HR surface that happens to live at its own top-level route
 * rather than under /hr, so it never inherited app/(app)/hr/layout.tsx and fell
 * back to the app's GLOBAL left sidebar — a different nav list from the module
 * rail every other HR surface shows. This layout gives it the same console
 * shell (see HrConsoleShell); chrome-shell.tsx additionally suppresses the
 * global sidebar here so the two rails don't stack.
 *
 * Mirrors app/(app)/hr/layout.tsx exactly — same workspace guard, same Suspense
 * boundary (the shell reads `?open=<stage>` via useSearchParams, which without a
 * boundary opts this route out of static rendering).
 */
export default async function PoliciesLayout({ children }: { children: ReactNode }) {
  const me = await requireWorkspace("hr");

  const role = me.department?.trim()
    ? me.department.trim()
    : me.role.charAt(0).toUpperCase() + me.role.slice(1);

  return (
    <Suspense fallback={null}>
      <HrConsoleShell user={{ name: me.name, role }}>{children}</HrConsoleShell>
    </Suspense>
  );
}
