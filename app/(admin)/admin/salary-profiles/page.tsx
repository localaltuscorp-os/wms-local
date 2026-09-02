import { Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listSalaryProfiles } from "@/lib/queries/salary";
import {
  listDesignationsWithCounts,
  listPayingEntitiesWithCounts,
} from "@/lib/queries/outstanding-rosters";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { SalaryProfileList } from "@/components/admin/salary-profile-list";
import { SalaryProfileImportDialog } from "@/components/admin/salary-profile-import-dialog";
import { payBasisFor } from "@/lib/attendance/worker-type";

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

  const withPay = rows.filter((r) => {
    const b = payBasisFor(r.workerType);
    return b === "hourly" ? r.monthlyPayAtTarget > 0 : b === "fixed_fee" ? r.monthlyFee > 0 : r.annualCtc > 0;
  }).length;

  return (
    <AdminSection
      eyebrow="Admin · Salary"
      title="Salary Profiles"
      subtitle={`${rows.length} active employees · ${withPay} with pay set · Set each person's employee type & pay (CTC, hourly or fixed-fee), TDS, PT-exemption, designation, paying entity and probation, and record monthly advances.`}
      icon={Wallet}
      stats={[
        { label: "Active employees", value: rows.length },
        { label: "With pay set", value: withPay, tone: "green" },
      ]}
      actions={<SalaryProfileImportDialog />}
    >
      <SalaryProfileList
        rows={rows}
        designations={designationOptions}
        entities={entityOptions}
      />
    </AdminSection>
  );
}
