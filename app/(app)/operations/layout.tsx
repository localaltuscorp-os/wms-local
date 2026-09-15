import { Suspense, type ReactNode } from "react";
import { OperationsQuickNavServer } from "@/components/operations/operations-quick-nav-server";

/**
 * The Operations room's own chrome: the quick-access row sits above every page
 * under /operations, carrying the pages of whichever area you are in.
 *
 * The global left sidebar keeps the four AREAS and does not swap (see
 * lib/operations/nav.ts) — this row is the second tier.
 *
 * Suspense: the row is an async server component, and without a boundary every
 * route under this layout opts out of static rendering. `fallback={null}` rather
 * than a skeleton — it is a 40px strip of chrome, and a placeholder that flashes
 * and is replaced is more movement than showing it a beat late.
 */
export default function OperationsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <OperationsQuickNavServer />
      </Suspense>
      {children}
    </>
  );
}
