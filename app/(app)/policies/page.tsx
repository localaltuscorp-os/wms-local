import { ScrollText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listPolicies, groupPolicies } from "@/lib/hr/sections";
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

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const groups = groupPolicies(await listPolicies());

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <PoliciesWorkspace groups={groups} isAdmin={isAdmin} />
      </main>
    </>
  );
}
