import { ScrollText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listPolicies, groupPolicies } from "@/lib/hr/sections";
import { POLICY_CARDS, isPolicyKey } from "@/lib/hr/policies/registry";
import { getMyPolicySignStatus, type MyPolicySignStatus } from "@/app/(app)/hr/policies/sign-status";
import { PoliciesWorkspace, type SignablePolicy } from "@/components/hr/policies/policies-workspace";

export const dynamic = "force-dynamic";

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

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  // Two sources, the same shape the mobile API returns (groups + signable):
  //   · `groups`   — legacy uploaded policy PDFs (the `documents` table).
  //   · `signable` — the AUTHORED firm policies (POSH / Exit / …), which are
  //     what people actually sign, with the viewer's own signed status. This
  //     is the half the web page used to be missing — HR Record showed a policy
  //     as signed while the Policies section read "No policies published yet",
  //     because the two read different tables.
  const [groups, signStatus] = await Promise.all([
    groupPolicies(await listPolicies()),
    // Sign status is best-effort: if it fails, every firm policy still renders,
    // it just reads "Read & sign" instead of "Signed" — the same neutral
    // fallback the All-Policies popup uses, so this page never 500s on it.
    getMyPolicySignStatus().catch((): MyPolicySignStatus => ({ signed: {}, outdated: {} })),
  ]);

  const signable: SignablePolicy[] = POLICY_CARDS.filter(
    (c) => c.status === "ready" && isPolicyKey(c.key),
  ).map((c) => ({
    key: c.key,
    title: c.title,
    blurb: c.blurb,
    badge: c.badge,
    signedAt: signStatus.signed[c.key] ?? null,
    outdated: Boolean(signStatus.outdated?.[c.key]),
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <PoliciesWorkspace groups={groups} signable={signable} isAdmin={isAdmin} />
      </main>
    </>
  );
}
