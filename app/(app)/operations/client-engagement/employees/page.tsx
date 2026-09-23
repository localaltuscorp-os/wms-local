import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { addDays } from "@/lib/client-engagement/schedule";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { EmpGrid } from "@/components/client-engagement/emp-grid";

export const dynamic = "force-dynamic";

const fmt = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** OPERATIONS → CLIENT ENGAGEMENT → EMP GRID — each employee's week, per category. */
export default async function ClientEngagementEmpGrid({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const ctx = await loadCePage(week);
  return (
    <PageShell width="full">
      {ctx.ready ? (
        <EmpGrid
          members={ctx.snapshot.members}
          accounts={ctx.snapshot.accounts}
          engagements={ctx.snapshot.engagements}
          monday={ctx.monday}
          weekLabel={`${fmt(ctx.monday)} – ${fmt(addDays(ctx.monday, 6))}`}
        />
      ) : (
        <CeNotReady />
      )}
    </PageShell>
  );
}
