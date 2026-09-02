import { ScrollText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { DashboardHeader } from "@/components/layout/header";
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
        blurb="The company handbook — every policy, versioned and searchable. This section is being built."
      />
    );
  }

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const groups = groupPolicies(await listPolicies());

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Policies
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            The Company Handbook
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[13.5px] font-medium text-ink-muted">
            Every company policy in one place. {isAdmin ? "Upload and organise policies by category — everyone can read them." : "Read the latest policies that apply to you."}
          </p>
        </header>
        <PoliciesWorkspace groups={groups} isAdmin={isAdmin} />
      </main>
    </>
  );
}
