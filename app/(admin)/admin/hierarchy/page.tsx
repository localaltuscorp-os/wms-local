import { Network } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { getHierarchy } from "@/lib/queries/hierarchy";
import { HierarchyBoard } from "@/components/admin/hierarchy-board";
import { AdminSection } from "@/components/admin/ui/section-shell";

/**
 * ADMIN › REPORTING HIERARCHY.
 *
 * The org chart as a Kanban board: one column per manager, their reports as
 * cards, drag (or "Move to…") to change who somebody reports to.
 *
 * ── WHAT A MOVE ACTUALLY CHANGES ───────────────────────────────────────────
 * One column: `employees.manager_id`. Every module that cares about the
 * hierarchy — tasks, goals, daily goals, DCC, KPI, team KPI, manager and team
 * dashboards, reporting views, approvals, PMS, appraisal, attendance analytics —
 * resolves the manager from that column when it runs. So the move reaches all of
 * them at once, and no historical row is rewritten.
 *
 * What is additionally written is the PERIOD (`employee_manager_history`), so a
 * report about a past month still resolves the manager who was in place then.
 */
export const dynamic = "force-dynamic";

export default async function HierarchyPage() {
  await requireAdmin();
  await requireModuleView("admin.people.hierarchy");

  const [snapshot, canEdit] = await Promise.all([
    getHierarchy(),
    canEditModule("admin.people.hierarchy"),
  ]);

  const managerCount = snapshot.columns.filter((c) => c.managerId !== null).length;

  return (
    <AdminSection
      eyebrow="Admin · People"
      title="Reporting hierarchy"
      subtitle="Who reports to whom. This is the one canonical reporting relationship in the application — every manager dashboard, team roll-up and approval chain reads it."
      icon={Network}
      stats={[
        { label: "People", value: snapshot.people.length },
        { label: "Managers", value: managerCount },
        {
          label: "No manager",
          value: snapshot.unassignedCount,
          tone: snapshot.unassignedCount > 0 ? "amber" : undefined,
        },
      ]}
    >
      <HierarchyBoard
        columns={snapshot.columns}
        people={snapshot.people}
        canEdit={canEdit}
      />
    </AdminSection>
  );
}
