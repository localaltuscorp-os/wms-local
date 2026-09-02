import { requireAdmin } from "@/lib/auth/current";
import { listDesignationsWithCounts } from "@/lib/queries/outstanding-rosters";
import { OutstandingRosterList } from "@/components/admin/outstanding-roster-list";
import { createDesignation, updateDesignation } from "./actions";

export const dynamic = "force-dynamic";

export default async function DesignationsPage() {
  await requireAdmin();
  const rows = await listDesignationsWithCounts();
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
          Designations
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
          {rows.length} total · {activeCount} active · Job titles assigned to
          employees
        </p>
      </header>
      <OutstandingRosterList
        title="Designations"
        items={rows}
        createAction={createDesignation}
        updateAction={updateDesignation}
        usageLabel="employees"
      />
    </div>
  );
}
