
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { loadCtcRoster } from "@/app/(app)/hr/ctc/actions";
import { CtcWorkbench } from "@/components/hr/ctc/ctc-workbench";

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
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
        </div>
        <span className="justify-self-center truncate text-[15px] font-extrabold tracking-tight text-ink-strong">
          CTC / Compensation Workbench
        </span>
        <span aria-hidden className="justify-self-end" />
      </header>

      <PageShell width="standard" py={false} className="pt-8 pb-24">
        <CtcWorkbench roster={roster} isAdmin={isAdmin} />
      </PageShell>
    </div>
  );
}
