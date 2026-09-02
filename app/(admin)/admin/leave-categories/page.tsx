import { Tag } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listLeaveCategories } from "@/lib/attendance/leave-categories";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { LeaveCategoryList } from "@/components/admin/leave-category-list";

export const dynamic = "force-dynamic";

/**
 * Admin · Leave Categories — the reasons the Apply-for-Leave dropdown offers.
 *
 * SEPARATE FROM PAY, on purpose. `leave_requests.kind` stays 'paid' | 'unpaid'
 * and only code can change that set, because the salary engine branches on it.
 * This page edits the human label beside it, which is meant to grow — so HR can
 * add "Paternity Leave" without anyone thinking about payroll.
 *
 * `requireAdmin()` is the whole gate. A wrong category is renamed; unlike a
 * client location, it is not something a punch is validated against.
 */
export default async function LeaveCategoriesPage() {
  await requireAdmin();

  const rows = await listLeaveCategories({ includeInactive: true });
  const active = rows.filter((r) => r.isActive);

  return (
    <AdminSection
      eyebrow="Admin · Attendance"
      title="Leave Categories"
      subtitle={`${active.length} in the dropdown · retired categories stay on the leaves that used them`}
      icon={Tag}
      stats={[
        { label: "In the dropdown", value: active.length, tone: "green" },
        { label: "Retired", value: rows.length - active.length },
      ]}
    >
      <LeaveCategoryList rows={rows} />
    </AdminSection>
  );
}
