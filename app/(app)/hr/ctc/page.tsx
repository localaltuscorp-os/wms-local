
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { loadCtcRoster } from "@/app/(app)/hr/ctc/actions";
import { CtcWorkbench } from "@/components/hr/ctc/ctc-workbench";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Pre-Joining → CTC / Compensation Workbench (`/hr/ctc`). For a selected employee
 * + paying entity, build/edit a structured CTC breakup (earnings, deductions,
 * employer contributions → gross, net, total CTC), versioned over time as a
 * Growth Journey with undo/redo, and jump to the compensation letters that quote
 * the numbers. Full-screen focused surface (no rail) — its own back button navs.
 */
export default async function CtcPage() {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const roster = await loadCtcRoster().catch(() => []);

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <HrTitleBar
      />

      <PageShell width="standard" py={false} className="pt-8 pb-24">
        <CtcWorkbench roster={roster} isAdmin={isAdmin} />
      </PageShell>
    </div>
  );
}
