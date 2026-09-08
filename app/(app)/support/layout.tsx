import { Suspense, type ReactNode } from "react";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrConsoleShell } from "@/components/hr/console/hr-console-shell";

/**
 * Help Desk is a rail module living at its own top-level route. It was already
 * suppressed from the GLOBAL sidebar (chrome-shell.tsx) but never given the
 * console shell in return, so it rendered with no sidebar at all — the one HR
 * surface with no navigation whatsoever.
 *
 * requireWorkspace("hr") does not narrow access: the HR room is open to every
 * employee (see canAccessWorkspace), which matters here because any employee
 * can raise and track their own ticket. Handler-vs-requester behaviour stays
 * where it already was, on the page itself.
 *
 * Mirrors app/(app)/policies/layout.tsx, Suspense boundary included.
 */
export default async function SupportLayout({ children }: { children: ReactNode }) {
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
