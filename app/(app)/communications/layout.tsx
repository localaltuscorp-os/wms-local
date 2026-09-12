import { Suspense, type ReactNode } from "react";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { OperationsQuickNavServer } from "@/components/operations/operations-quick-nav-server";

/**
 * Broadcasts (Enterprise Communications) moved from HR to the OPERATIONS room
 * on 2026-09-12.
 *
 * Its route did not have to move: /communications was always its own top-level
 * path, never under app/(app)/hr/. Only the chrome around it was HR's — this
 * layout used to wrap the page in HrConsoleShell, and chrome-shell.tsx
 * suppressed the global sidebar so the two rails did not stack. Both are undone:
 * the page now gets the ordinary global sidebar, which shows the Operations rail
 * because lib/workspaces.ts maps this prefix to `operations`, plus the room's
 * quick-access row from this layout.
 *
 * ACCESS IS UNCHANGED. It was requireWorkspace("hr") and is now
 * requireWorkspace("operations"); BOTH rooms are open to every employee (see
 * canAccessWorkspace — only department-gated rooms like Sales turn anyone away),
 * so reading broadcasts is exactly as open as it was. Authoring stays gated by
 * the page's own isHrStaff check, which did not move.
 *
 * The Suspense boundary stays for the same reason it was added: a child reads
 * useSearchParams, which without a boundary opts this route out of static
 * rendering at build time.
 */
export default async function CommunicationsLayout({ children }: { children: ReactNode }) {
  await requireWorkspace("operations");

  return (
    <Suspense fallback={null}>
      <OperationsQuickNavServer />
      {children}
    </Suspense>
  );
}
