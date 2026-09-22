import Link from "next/link";
import type { Route } from "next";
import { Users as UsersIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listControlPanelUsers } from "@/lib/queries/control-panel";
import { AdminSection } from "@/components/admin/ui/section-shell";

export const dynamic = "force-dynamic";

/**
 * CONTROL PANEL → USERS — a read-only view over the EXISTING employee directory.
 * No employee data is duplicated here; it is joined live from employees +
 * functions / designations / paying entities, plus the roles each person holds.
 * Selecting a row deep-links to Effective Access.
 */
export default async function ControlPanelUsersPage() {
  await requireAdmin();
  const users = await listControlPanelUsers();

  return (
    <AdminSection
      title="Control Panel · Users"
      subtitle="Every employee, their org fields, and the roles they hold. Select a row to see their effective access."
      icon={UsersIcon}
      stats={[
        { label: "Employees", value: users.length },
        { label: "Active", value: users.filter((u) => u.isActive).length },
      ]}
    >
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr>
              {["Employee", "Employee ID", "Function", "Designation", "Entity", "Roles", "Status"].map((h) => (
                <th key={h} className="border-b border-hairline-strong px-3 py-2 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/control-panel/effective-access?emp=${u.id}` as Route}
                    className="text-[12.5px] font-semibold text-ink-strong hover:underline"
                  >
                    {u.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[12.5px] text-ink-soft">{u.employeeCode ?? "—"}</td>
                <td className="px-3 py-2 text-[12.5px] text-ink-soft">{u.functionName ?? "—"}</td>
                <td className="px-3 py-2 text-[12.5px] text-ink-soft">{u.designationName ?? "—"}</td>
                <td className="px-3 py-2 text-[12.5px] text-ink-soft">{u.entityName ?? "—"}</td>
                <td className="px-3 py-2 text-[12.5px] text-ink-soft">
                  {u.roleNames.length > 0 ? u.roleNames.join(", ") : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                      u.isActive ? "bg-surface-soft text-ink-soft" : "bg-altus-red-soft text-altus-red"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}
