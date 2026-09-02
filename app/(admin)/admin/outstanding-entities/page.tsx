import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingEntitiesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { createEntity, updateEntity } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutstandingEntitiesPage() {
  await requireAdmin();
  const rows = await listOutstandingEntitiesWithCounts();
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
          Entities
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
          {rows.length} total · {activeCount} active · Billing entities used on
          outstanding contracts
        </p>
      </header>
      <OutstandingRosterList
        title="Entities"
        items={rows}
        createAction={createEntity}
        updateAction={updateEntity}
        usageLabel="contracts"
      />
    </div>
  );
}
