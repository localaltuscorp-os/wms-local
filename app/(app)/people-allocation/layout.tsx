import { Suspense, type ReactNode } from "react";
import { OperationsQuickNavServer } from "@/components/operations/operations-quick-nav-server";

/**
 * Hand-holding is an AREA INSIDE OPERATIONS (2026-09-11) but kept its own route
 * tree at /people-allocation, so every existing link and bookmark still
 * resolves. This layout is what gives it the room's quick-access row —
 * Hand-holding · All Participants · Ambassadors · Development · Admin Panel —
 * the same one /operations and /events mount.
 *
 * Nothing else: access is still asserted by each page (requireUser + lib/hh/
 * access), unchanged by the move.
 */
export default function PeopleAllocationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <OperationsQuickNavServer />
      </Suspense>
      {children}
    </>
  );
}
