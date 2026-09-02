import { requireAdmin } from "@/lib/auth/current";
import { listPayingEntitiesWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { createPayingEntity, updatePayingEntity } from "./actions";

export const dynamic = "force-dynamic";

export default async function PayingEntitiesPage() {
  await requireAdmin();
  const rows = await listPayingEntitiesWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <div>
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Salary
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
          Paying Entities
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
          {rows.length} total · {activeCount} active · Legal entities that pay
          employee salaries
        </p>
      </header>
      <OutstandingRosterList
        title="Paying Entities"
        items={rows}
        createAction={createPayingEntity}
        updateAction={updatePayingEntity}
        usageLabel="employees"
      />
    </div>
  );
}
