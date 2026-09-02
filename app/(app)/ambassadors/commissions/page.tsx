import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { commissionLedger } from "@/lib/queries/ambassadors";
import { CommissionCenter } from "@/components/ambassadors/commission-center";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  await requireWorkspace("sales");
  const { owed, paid } = await commissionLedger();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--color-altus-red-deep)" }}
          >
            Ambassadors
          </span>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.4vw, 44px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
            }}
          >
            Commissions
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            What each partner has earned, and what&apos;s been paid.
          </p>
        </header>

        <CommissionCenter owed={owed} paid={paid} />
      </main>
    </>
  );
}
