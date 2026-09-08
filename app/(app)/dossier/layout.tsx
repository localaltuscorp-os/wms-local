import { Suspense, type ReactNode } from "react";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrConsoleShell } from "@/components/hr/console/hr-console-shell";

/**
 * The dossier + onboarding form are reached straight from the HR console —
 * Pre-Joining -> "Employment Form" links here — but they live at their own
 * top-level route, so they never inherited app/(app)/hr/layout.tsx. Opening
 * that step therefore swapped the whole frame: module rail and step list gone,
 * replaced by the global HR sidebar. This layout keeps the console around them
 * so stepping into the form no longer changes the structure of the page.
 *
 * requireWorkspace("hr") does not narrow access: the HR room is open to every
 * employee (see canAccessWorkspace), which matters here because an employee
 * fills their OWN onboarding form. The real per-record gating stays where it
 * already was — requireDossierAccess / canManageEmployeeOnboarding on the page.
 *
 * Mirrors app/(app)/policies/layout.tsx, Suspense boundary included (the shell
 * reads `?open=<stage>` via useSearchParams).
 */
export default async function DossierLayout({ children }: { children: ReactNode }) {
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
