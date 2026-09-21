import { Suspense, type ReactNode } from "react";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { hiddenModuleKeys } from "@/lib/permissions/resolve";
import { HrConsoleShell } from "@/components/hr/console/hr-console-shell";

/**
 * Every HR surface renders inside the three-column HR console (see
 * HrConsoleShell): the module rail and step list are the module's navigation,
 * and the page itself is the third column.
 *
 * The rail replaces the old per-page HR chrome — HrShellSidebar was removed
 * from the pages under this layout so the console is the ONE navigation
 * surface rather than a second rail stacked beside them.
 */
export default async function HrLayout({ children }: { children: ReactNode }) {
  // The (app) layout gates the workspace too, but HR pages have always guarded
  // in-place as well ("the layout gate alone isn't reliable on prod") — keep
  // that belt-and-braces guard now that it's hoisted here.
  const me = await requireWorkspace("hr");

  const role = me.department?.trim()
    ? me.department.trim()
    : me.role.charAt(0).toUpperCase() + me.role.slice(1);

  // WHICH HR STEPS THIS PERSON HAS BEEN DENIED.
  //
  // Resolved on the SERVER and handed down as a plain list of node keys: the
  // console is a client component and the browser must never be the thing that
  // decides what somebody may see. `hiddenModuleKeys()` returns null — not an
  // empty set — when the matrix does not govern the person at all (a master
  // admin), which is the distinction the shell needs to show everything.
  //
  // A failure here must not blank the rail: the matrix is a narrowing layer on
  // top of authorization that has already been granted, so if it cannot be read
  // the honest degradation is to show the modules the person legitimately has.
  const hidden = await hiddenModuleKeys().catch(() => null);

  // Suspense boundary: the shell reads `?open=<stage>` via useSearchParams, and
  // without a boundary that opts EVERY route under this layout out of static
  // rendering at build time.
  return (
    <Suspense fallback={null}>
      <HrConsoleShell
        user={{ name: me.name, role }}
        hiddenNodes={hidden ? [...hidden] : null}
      >
        {children}
      </HrConsoleShell>
    </Suspense>
  );
}
