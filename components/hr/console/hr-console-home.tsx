"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useHrConsolePreviewedModule } from "./hr-console-context";
import { HrModuleGhost } from "./hr-module-ghost";

// Loaded on demand — keeps the (sizeable) policy content out of the /hr bundle.
// Opened from Pre-Joining → "Policy Signatures" via /hr?policies=1.
const AllPoliciesPopup = dynamic(
  () => import("@/components/hr/policies/all-policies-popup").then((m) => m.AllPoliciesPopup),
  { ssr: false },
);

/**
 * The HR console's front door — what fills the third column at /hr, before a
 * step is chosen. The old animated card deck is gone: the module rail and step
 * list ARE the navigation now, so this pane orients rather than re-navigates.
 *
 * It still honours /hr?policies=1 (the "Policy Signatures" step), which used to
 * open the all-policies sheet from the landing page.
 */
export function HrConsoleHome() {
  const searchParams = useSearchParams();
  const wantsPolicies = Boolean(searchParams?.get("policies"));
  const [policiesOpen, setPoliciesOpen] = React.useState(false);

  // The module previewed in the rail — set the instant someone clicks a
  // module with steps, well before any navigation happens. (A leaf module
  // never reaches here: it's a real link, so clicking one navigates away
  // from this page entirely instead of setting a preview.)
  const previewed = useHrConsolePreviewedModule();

  React.useEffect(() => {
    // OPEN TO EVERY EMPLOYEE (2026-09-17). This was staff-only, which made the
    // firm's own policies unreadable by the people they bind: the individual
    // pages (/hr/policies/<key>) were already open to all, so the gate hid the
    // LIST, not the content. A policy nobody outside HR can find is not
    // published. Authoring and editing stay staff-only — that gate is on
    // /hr/policies/<key>/edit, not here.
    if (wantsPolicies) setPoliciesOpen(true);
  }, [wantsPolicies]);

  // The card itself is HrModuleGhost — shared with HrConsoleShell, which
  // shows the SAME pane when you pick a module while another module's page
  // is still routed. One component so the two states can't drift apart.
  return (
    <>
      <HrModuleGhost module={previewed} />
      <AllPoliciesPopup open={policiesOpen} onClose={() => setPoliciesOpen(false)} />
    </>
  );
}
