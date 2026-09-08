import { Suspense, type ReactNode } from "react";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrConsoleShell } from "@/components/hr/console/hr-console-shell";

/**
 * Enterprise Communications is an HR surface living at its own top-level route,
 * so it never inherited app/(app)/hr/layout.tsx. It was worse off than Policies:
 * /communications was claimed by NO workspace at all, so instead of merely
 * getting the wrong sidebar it fell back to the legacy horizontal
 * DashboardHeader nav (the row of module pills) and got no sidebar whatsoever.
 *
 * Two changes fix that, and this layout is only the second half:
 *   1. lib/workspaces.ts now maps /communications to the HR room, which retires
 *      that horizontal header by itself — DashboardHeader renders null once a
 *      path belongs to a workspace, so the page needs no edit.
 *   2. this layout wraps the route in the same console shell every other HR
 *      surface uses. chrome-shell.tsx additionally suppresses the global
 *      sidebar here so the two rails do not stack.
 *
 * requireWorkspace("hr") does NOT narrow who can read broadcasts: the HR room is
 * open to every employee (see canAccessWorkspace) and only department-gated rooms
 * like Sales turn anyone away. Authoring stays gated by the page’s own isHrStaff
 * check, exactly as before.
 *
 * Mirrors app/(app)/policies/layout.tsx, Suspense boundary included — the shell
 * reads `?open=<stage>` via useSearchParams, which without a boundary would opt
 * this route out of static rendering.
 */
export default async function CommunicationsLayout({ children }: { children: ReactNode }) {
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
