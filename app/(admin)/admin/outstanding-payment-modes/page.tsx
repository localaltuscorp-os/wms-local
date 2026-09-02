import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingPaymentModesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { createPaymentMode, updatePaymentMode } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutstandingPaymentModesPage() {
  await requireAdmin();
  const rows = await listOutstandingPaymentModesWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <div>
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Outstanding
        </div>
        <h1
          className="mt-1 text-ink-strong"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Payment Modes
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
          {rows.length} total · {activeCount} active · Expected payment modes on
          outstanding contracts
        </p>
      </header>
      <OutstandingRosterList
        title="Payment Modes"
        items={rows}
        createAction={createPaymentMode}
        updateAction={updatePaymentMode}
        usageLabel="contracts"
      />
    </div>
  );
}
