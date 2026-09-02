import { requireAdmin } from "@/lib/auth/current";
import { listSalaryProfiles } from "@/lib/queries/salary";
import {
  listDesignationsWithCounts,
  listPayingEntitiesWithCounts,
} from "@/lib/queries/outstanding-rosters";
import { SalaryProfileList } from "@/components/admin/salary-profile-list";

export const dynamic = "force-dynamic";

export default async function SalaryProfilesPage() {
  await requireAdmin();

  const [rows, designations, entities] = await Promise.all([
    listSalaryProfiles(),
    listDesignationsWithCounts(),
    listPayingEntitiesWithCounts(),
  ]);

  // Only active roster items are offered in the pickers.
  const designationOptions = designations
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name }));
  const entityOptions = entities
    .filter((e) => e.isActive)
    .map((e) => ({ id: e.id, name: e.name }));

  const withCtc = rows.filter((r) => r.annualCtc > 0).length;

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
          Salary Profiles
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
          {rows.length} active employees · {withCtc} with a CTC set · Set each
          person&apos;s CTC, TDS, PT-exemption, designation, paying entity and
          probation, and record monthly advances.
        </p>
      </header>
      <SalaryProfileList
        rows={rows}
        designations={designationOptions}
        entities={entityOptions}
      />
    </div>
  );
}
