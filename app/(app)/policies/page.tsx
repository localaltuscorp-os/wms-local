import { ScrollText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listPolicies, groupPolicies } from "@/lib/hr/sections";
import { canPublishPolicies } from "@/lib/hr/policies/access";
import { POLICY_CARDS } from "@/lib/hr/policies/registry";
import { getMyPolicySignStatus, type MyPolicySignStatus } from "@/app/(app)/hr/policies/sign-status";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { PoliciesWorkspace } from "@/components/hr/policies/policies-workspace";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function PoliciesPage() {
  const me = await requireWorkspace("hr");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Policies"
        Icon={ScrollText}
        blurb="The company handbook - every policy, versioned and searchable. This section is being built."
      />
    );
  }

  // Only Manan, Ruchita and Rutvisha publish policies — an admin flag is not
  // enough. Hiding the controls is a convenience; actions.ts is the control.
  const canPublish = canPublishPolicies(me, DUMMY_MODE);
  const groups = groupPolicies(await listPolicies());

  // The viewer's OWN signing status, so each card can say "Signed · date" and
  // offer the archived copy they signed. Best-effort: if the query fails the
  // cards still render, simply without a badge — a policy list must never 500
  // over a badge.
  const signStatus = await getMyPolicySignStatus().catch(
    (): MyPolicySignStatus => ({ signed: {}, outdated: {} }),
  );
  const cards = POLICY_CARDS.map((c) => ({
    ...c,
    signedAt: signStatus.signed[c.key] ?? null,
    outdated: Boolean(signStatus.outdated?.[c.key]),
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <PoliciesWorkspace groups={groups} isAdmin={canPublish} cards={cards} />
      </main>
    </>
  );
}
