import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import {
  listReferrals,
  listAmbassadors,
  listAmbProducts,
} from "@/lib/queries/ambassadors";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { PipelineBoard } from "@/components/ambassadors/pipeline-board";

export const dynamic = "force-dynamic";

export default async function AmbassadorPipelinePage() {
  await requireWorkspace("sales");

  const [referrals, ambassadors, products, employees] = await Promise.all([
    listReferrals(),
    listAmbassadors(),
    listAmbProducts(),
    listEmployeeOptions(),
  ]);

  const ambassadorOptions = ambassadors.map((a) => ({ id: a.id, name: a.name }));

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
              fontSize: "clamp(28px, 3.2vw, 42px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
            }}
          >
            Pipeline
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Every referral from received to commission paid — drag a card to advance the deal.
          </p>
        </header>

        <PipelineBoard
          referrals={referrals}
          ambassadors={ambassadorOptions}
          products={products}
          employees={employees}
        />
      </main>
    </>
  );
}
