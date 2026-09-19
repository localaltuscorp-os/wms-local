import { Gift } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { listIncentiveMaster } from "@/lib/queries/incentive-master";
import { listActiveProducts } from "@/lib/queries/products";
import { mayManageIncentiveEligibility } from "@/lib/incentive/eligibility-guard";
import { todayIst } from "@/lib/incentive/master";
import { IncentiveMasterTable } from "@/components/admin/incentive-master/master-table";

export const dynamic = "force-dynamic";

/**
 * ADMIN PANEL → INCENTIVE → INCENTIVE MASTER.
 *
 * The incentive schemes the whole module prices from, and the Incentive Chart
 * that says who is eligible for each one.
 *
 * ── IT IS `incentive_catalog`, NOT A NEW TABLE ─────────────────────────────
 * These rows ARE the "Incentive Table" the Incentive page has always shown, the
 * prices the dashboard values approvals at, and what
 * `weekly_goals.incentive_catalog_id` points to. Migration 0232 added the
 * fields the brief asks for — type, product, duration, valid until — as columns
 * on that table. A second incentive table would mean two answers to "what does
 * a Google Review pay", and eventually two different ones.
 *
 * The in-app Incentive Table dialog (components/incentive/incentive-catalog-
 * dialog.tsx) still reads and edits the same rows. This screen is the admin
 * door onto them, with the fields and the eligibility the dialog has no room
 * for — not a replacement.
 *
 * ── AUTHORIZATION ──────────────────────────────────────────────────────────
 * `requireAdmin()` again — the layout's gate does not protect an action — then
 * the permission matrix. The two capabilities below are resolved HERE and
 * passed down as props, so the table renders from a server decision rather than
 * making one:
 *
 *   · `canEdit`        — may create, edit, activate and delete an incentive.
 *   · `canManageChart` — may change who is eligible. Manan alone, and
 *                        deliberately NOT implied by admin or by `canEdit`.
 *
 * Everything they gate is ALSO gated in the actions. What is passed here only
 * decides what appears; nothing here is load-bearing on its own.
 */
export default async function IncentiveMasterPage() {
  await requireAdmin();
  await requireModuleView("admin.incentive.master");

  const [rows, products, canEdit, canManageChart] = await Promise.all([
    listIncentiveMaster(),
    listActiveProducts(),
    canEditModule("admin.incentive.master"),
    mayManageIncentiveEligibility(),
  ]);

  const today = todayIst();
  const active = rows.filter((r) => r.active).length;
  /**
   * Live schemes nobody can earn from — active, in date, and with an empty
   * audience. Shown as a stat because it is the one thing about this master
   * somebody would want to fix and it is invisible in a list of names: the row
   * looks perfectly healthy until you open its Incentive Chart.
   */
  const unreachable = rows.filter((r) => r.onOffer && r.eligibleCount === 0).length;
  const expiring = rows.filter(
    (r) => r.active && r.validUntil != null && r.validUntil >= today,
  ).length;

  return (
    <AdminSection
      title="Incentive Master"
      subtitle="The incentive schemes and what they pay — type, product, amount, duration — and who is eligible for each."
      icon={Gift}
      stats={[
        { label: "Incentives", value: rows.length },
        { label: "Active", value: active, tone: "green" },
        { label: "With an end date", value: expiring },
        {
          label: "Nobody eligible",
          value: unreachable,
          tone: unreachable ? "amber" : undefined,
        },
      ]}
    >
      <IncentiveMasterTable
        rows={rows}
        products={products}
        canEdit={canEdit}
        canManageChart={canManageChart}
        today={today}
      />
    </AdminSection>
  );
}
