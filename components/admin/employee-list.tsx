"use client";

import { useMemo, useState } from "react";
import { Crown, Search, Star } from "lucide-react";
import type { Employee } from "@/db/schema";
import { EmployeeRowActions } from "@/components/admin/employee-row-actions";
import type { EmployeeDepartmentMembership } from "@/components/admin/edit-employee-dialog";
import type { DepartmentOption } from "@/components/admin/department-multi-select";

interface Props {
  employees: Employee[];
  /** employeeId → the departments they belong to (primary flagged). */
  membershipsByEmployee: Record<string, EmployeeDepartmentMembership[]>;
  currentEmployeeId: string;
  /** True only for super-admins (Hetesh / Manan) — gates the admin toggle. */
  canManageAdmins: boolean;
  departmentOptions: DepartmentOption[];
  managerOptions: { value: string; label: string }[];
}

function DepartmentCell({
  memberships,
}: {
  memberships: EmployeeDepartmentMembership[];
}) {
  if (memberships.length === 0) {
    return <span className="text-ink-subtle">—</span>;
  }
  const ordered = [...memberships].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name),
  );
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {ordered.map((m) => (
        <span
          key={m.id}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset"
          style={{
            background: m.isPrimary ? "#FEF2F2" : "#F1F5F9",
            color: m.isPrimary ? "#A80400" : "#334155",
            boxShadow: `inset 0 0 0 1px ${m.isPrimary ? "#FECACA" : "#CBD5E1"}`,
          }}
        >
          {m.isPrimary && <Star size={11} strokeWidth={2.4} fill="#A80400" />}
          {m.name}
        </span>
      ))}
    </span>
  );
}

const ROLE_CHIP: Record<
  "doer" | "initiator" | "both",
  { bg: string; fg: string; ring: string; label: string }
> = {
  doer:      { bg: "#EFF6FF", fg: "#1D4ED8", ring: "#BFDBFE", label: "Doer" },
  initiator: { bg: "#F5F3FF", fg: "#6D28D9", ring: "#DDD6FE", label: "Initiator" },
  both:      { bg: "#F1F5F9", fg: "#334155", ring: "#CBD5E1", label: "Both" },
};

function RoleChip({ role }: { role: "doer" | "initiator" | "both" }) {
  const c = ROLE_CHIP[role];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset"
      style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      {c.label}
    </span>
  );
}

function AdminCell({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) {
    return <span className="text-ink-subtle" aria-label="Not an admin">—</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
      style={{
        background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
        boxShadow: "0 1px 4px rgba(225, 6, 0, 0.30)",
      }}
    >
      <Crown size={12} strokeWidth={2.4} />
      Admin
    </span>
  );
}

function StatusPill({
  isActive,
  joinedAt,
}: {
  isActive: boolean;
  joinedAt: Date | null;
}) {
  if (!isActive) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
        style={{
          background: "var(--color-red-bg)",
          color: "var(--color-red-deep)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-red)" }}
        />
        Deactivated
      </span>
    );
  }
  if (joinedAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
        style={{
          background: "var(--color-green-bg)",
          color: "var(--color-green-deep)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-green)" }}
        />
        Active
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: "var(--color-amber-bg)",
        color: "var(--color-amber-deep)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--color-amber)" }}
      />
      Invited
    </span>
  );
}

export function EmployeeList({
  employees,
  membershipsByEmployee,
  currentEmployeeId,
  canManageAdmins,
  departmentOptions,
  managerOptions,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const deptNames = (membershipsByEmployee[e.id] ?? [])
        .map((m) => m.name)
        .join(" ")
        .toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        deptNames.includes(q)
      );
    });
  }, [employees, membershipsByEmployee, query]);

  if (employees.length === 0) {
    return (
      <div
        className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{
            fontStyle: "italic",
            fontSize: 22,
            letterSpacing: "-0.015em",
          }}
        >
          No employees yet
        </p>
        <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
          Invite your first teammate with the button above — they'll get a
          signed link to set their password.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Search row */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search
            size={16}
            strokeWidth={2.2}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or department"
            aria-label="Search employees"
            className="w-full pl-10 pr-3.5 py-3 text-[15px] rounded-chip bg-surface-card border border-hairline focus:border-altus-red focus:outline-none transition-colors"
            style={{
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
            }}
          />
        </div>
        <div className="text-[13px] text-ink-subtle tabular-nums">
          {filtered.length} of {employees.length}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-section border border-hairline bg-surface-card overflow-x-auto"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <table className="w-full min-w-[720px] text-[15px]">
          <thead>
            <tr
              className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <th className="px-5 py-4">Name</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4">Role</th>
              <th className="px-5 py-4">Department</th>
              <th className="px-5 py-4">Admin</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 w-12 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-ink-subtle italic">
                  No employees match "{query}".
                </td>
              </tr>
            ) : (
              filtered.map((e, i) => (
                <tr
                  key={e.id}
                  className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
                  style={{
                    background:
                      i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                  }}
                >
                  <td className="px-5 py-4 text-ink-strong font-medium max-w-[24ch] truncate" title={e.name}>
                    {e.name}
                  </td>
                  <td className="px-5 py-4 text-ink-soft max-w-[32ch] truncate" title={e.email}>{e.email}</td>
                  <td className="px-5 py-4">
                    <RoleChip role={e.role} />
                  </td>
                  <td className="px-5 py-4 text-ink-soft">
                    <DepartmentCell
                      memberships={membershipsByEmployee[e.id] ?? []}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <AdminCell isAdmin={e.isAdmin} />
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill isActive={e.isActive} joinedAt={e.joinedAt} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <EmployeeRowActions
                      employee={{
                        id: e.id,
                        name: e.name,
                        email: e.email,
                        role: e.role,
                        departments: membershipsByEmployee[e.id] ?? [],
                        isAdmin: e.isAdmin,
                        isActive: e.isActive,
                        joinedAt: e.joinedAt,
                        whatsappPhone: e.whatsappPhone,
                        whatsappOptedIn: e.whatsappOptedIn,
                        managerId: e.managerId,
                        attendanceBiometricExempt: e.attendanceBiometricExempt,
                        weeklyOff: e.weeklyOff,
                        attOfficialStart: e.attOfficialStart,
                        attLateAfter: e.attLateAfter,
                        attOfficialEnd: e.attOfficialEnd,
                        attEarlyBefore: e.attEarlyBefore,
                      }}
                      isSelf={e.id === currentEmployeeId}
                      canManageAdmins={canManageAdmins}
                      departmentOptions={departmentOptions}
                      managerOptions={managerOptions}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
