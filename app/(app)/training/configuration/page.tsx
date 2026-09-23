import { Settings2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listLearningTargets } from "@/lib/queries/learning-targets";
import { TargetsConfig } from "@/components/training/configuration/targets-config";
import { LookupsConfig } from "@/components/training/configuration/lookups-config";
import { listLookups } from "@/lib/queries/training-lookups";
import { LOOKUP_KINDS, type LookupKind, type LookupOption } from "@/lib/training/lookups";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function TrainingConfigurationPage() {
  const me = await requireWorkspace("training");
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  const targets = await listLearningTargets();
  const lookupLists = await Promise.all(LOOKUP_KINDS.map((k) => listLookups(k)));
  const byKind = Object.fromEntries(LOOKUP_KINDS.map((k, i) => [k, lookupLists[i]!])) as Record<LookupKind, LookupOption[]>;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <Settings2 size={13} strokeWidth={2.6} /> Configuration
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            Learning Configuration
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Per-role targets. A new target closes the previous one, so past months keep their history.
          </p>
        </header>

        {isAdmin ? (
          <div className="max-w-3xl">
            <TargetsConfig rows={targets} />

            <div className="mt-8">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-soft">Master data</h2>
              <LookupsConfig byKind={byKind} />
            </div>
          </div>
        ) : (
          <p className="text-ink-muted">Only admins can change learning configuration.</p>
        )}
      </main>
    </>
  );
}
