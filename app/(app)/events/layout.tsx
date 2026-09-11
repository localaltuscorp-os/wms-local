import { Suspense } from "react";
import { notFound } from "next/navigation";
import { monthlyEventsEnabled } from "@/lib/monthly-events/flag";
import { OperationsQuickNavServer } from "@/components/operations/operations-quick-nav-server";

/**
 * Monthly Events Master module gate. The whole `/events` surface ships behind
 * the `MONTHLY_EVENTS_OFF` kill-switch — when disabled, every route 404s. Access
 * (admin vs viewer) is re-asserted inside each page (layout gates are unreliable
 * on prod), so this layout only enforces the flag and passes children through.
 *
 * It also mounts the OPERATIONS quick-access row (2026-09-11): Monthly Events
 * Master is an area inside that room now, but kept its own route tree, so this
 * is where its pages — Overview · Calendar · Masters · Batches · Obligations —
 * get their second-tier bar. Mounted BELOW the kill-switch check, so a disabled
 * module shows no chrome for pages that 404.
 */
export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!monthlyEventsEnabled()) notFound();
  return (
    <>
      <Suspense fallback={null}>
        <OperationsQuickNavServer />
      </Suspense>
      {children}
    </>
  );
}
