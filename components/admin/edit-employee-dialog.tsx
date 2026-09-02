"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import {
  editEmployee,
  updateEmployeeAttendanceSchedule,
} from "@/app/(admin)/admin/employees/actions";
import { Select } from "@/components/ui/select";
import {
  DepartmentMultiSelect,
  type DepartmentOption,
} from "@/components/admin/department-multi-select";

type Role = "doer" | "initiator" | "both";

export interface EmployeeDepartmentMembership {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    name: string;
    email: string;
    role: Role;
    departments: EmployeeDepartmentMembership[];
    isAdmin: boolean;
    whatsappPhone: string | null;
    whatsappOptedIn: boolean;
    managerId?: string | null;
    attendanceBiometricExempt: boolean;
    weeklyOff: number;
    attOfficialStart: string | null;
    attLateAfter: string | null;
    attOfficialEnd: string | null;
    attEarlyBefore: string | null;
  };
  isSelf: boolean;
  /** True only for super-admins (Hetesh / Manan) — gates the admin toggle. */
  canManageAdmins: boolean;
  departmentOptions: DepartmentOption[];
  managerOptions: { value: string; label: string }[];
}

/** Compare two id lists as sets (order-independent). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

/** Postgres `time` columns can read back as "HH:mm:ss"; trim to "HH:mm" so the
 *  native time input accepts them. Null stays "". */
function toHHmm(v: string | null): string {
  if (!v) return "";
  return v.slice(0, 5);
}

export function EditEmployeeDialog({
  open,
  onOpenChange,
  employee,
  isSelf,
  canManageAdmins,
  departmentOptions,
  managerOptions,
}: EditEmployeeDialogProps) {
  const initialDeptIds = employee.departments.map((d) => d.id);
  const initialPrimaryId =
    employee.departments.find((d) => d.isPrimary)?.id ??
    employee.departments[0]?.id ??
    null;

  const [name, setName]         = useState(employee.name);
  const [role, setRole]         = useState<Role>(employee.role);
  const [deptIds, setDeptIds]   = useState<string[]>(initialDeptIds);
  const [primaryId, setPrimaryId] = useState<string | null>(initialPrimaryId);
  const [isAdmin, setIsAdmin]   = useState(employee.isAdmin);
  const [managerId, setManagerId] = useState<string | null>(employee.managerId ?? null);
  const [waPhone, setWaPhone]   = useState(employee.whatsappPhone ?? "");
  const [waOptIn, setWaOptIn]   = useState(employee.whatsappOptedIn);
  const [bioExempt, setBioExempt] = useState(employee.attendanceBiometricExempt);
  const [weeklyOff, setWeeklyOff] = useState<number>(employee.weeklyOff);
  const [offStart, setOffStart]   = useState(toHHmm(employee.attOfficialStart));
  const [lateAfter, setLateAfter] = useState(toHHmm(employee.attLateAfter));
  const [offEnd, setOffEnd]       = useState(toHHmm(employee.attOfficialEnd));
  const [earlyBefore, setEarlyBefore] = useState(toHHmm(employee.attEarlyBefore));
  const [error, setError]       = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [schedError, setSchedError] = useState<string | null>(null);
  const [schedPending, startSchedTransition] = useTransition();

  // Re-sync local state whenever the dialog opens for a (possibly different)
  // employee — otherwise stale values bleed across rows.
  useEffect(() => {
    if (open) {
      setName(employee.name);
      setRole(employee.role);
      setDeptIds(employee.departments.map((d) => d.id));
      setPrimaryId(
        employee.departments.find((d) => d.isPrimary)?.id ??
          employee.departments[0]?.id ??
          null,
      );
      setIsAdmin(employee.isAdmin);
      setManagerId(employee.managerId ?? null);
      setWaPhone(employee.whatsappPhone ?? "");
      setWaOptIn(employee.whatsappOptedIn);
      setBioExempt(employee.attendanceBiometricExempt);
      setWeeklyOff(employee.weeklyOff);
      setOffStart(toHHmm(employee.attOfficialStart));
      setLateAfter(toHHmm(employee.attLateAfter));
      setOffEnd(toHHmm(employee.attOfficialEnd));
      setEarlyBefore(toHHmm(employee.attEarlyBefore));
      setError(null);
      setSchedError(null);
    }
    // employee.departments is a fresh array per render; key on id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    employee.id,
    employee.name,
    employee.role,
    employee.isAdmin,
    employee.managerId,
    employee.whatsappPhone,
    employee.whatsappOptedIn,
    employee.attendanceBiometricExempt,
    employee.weeklyOff,
    employee.attOfficialStart,
    employee.attLateAfter,
    employee.attOfficialEnd,
    employee.attEarlyBefore,
  ]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Build a sparse patch — only changed fields.
    const patch: {
      name?: string;
      role?: Role;
      departmentIds?: string[];
      primaryDepartmentId?: string | null;
      isAdmin?: boolean;
      managerId?: string | null;
      whatsappPhone?: string | null;
      whatsappOptedIn?: boolean;
      attendanceBiometricExempt?: boolean;
    } = {};
    const trimmedName = name.trim();
    const trimmedWaPhone = waPhone.trim();
    const currentWaPhone = employee.whatsappPhone ?? "";

    if (trimmedName !== employee.name) patch.name = trimmedName;
    if (role !== employee.role) patch.role = role;
    if (!sameSet(deptIds, initialDeptIds) || primaryId !== initialPrimaryId) {
      patch.departmentIds = deptIds;
      patch.primaryDepartmentId = primaryId;
    }
    if (isAdmin !== employee.isAdmin) patch.isAdmin = isAdmin;
    if (managerId !== (employee.managerId ?? null)) patch.managerId = managerId;
    if (trimmedWaPhone !== currentWaPhone) {
      patch.whatsappPhone = trimmedWaPhone === "" ? null : trimmedWaPhone;
    }
    if (waOptIn !== employee.whatsappOptedIn) {
      patch.whatsappOptedIn = waOptIn;
    }
    if (bioExempt !== employee.attendanceBiometricExempt) {
      patch.attendanceBiometricExempt = bioExempt;
    }

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await editEmployee(employee.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName || employee.name} updated.` });
      onOpenChange(false);
    });
  }

  function onSaveSchedule() {
    setSchedError(null);
    startSchedTransition(async () => {
      const res = await updateEmployeeAttendanceSchedule({
        employeeId: employee.id,
        weeklyOff,
        // "" clears the override back to the company default.
        attOfficialStart: offStart || null,
        attLateAfter: lateAfter || null,
        attOfficialEnd: offEnd || null,
        attEarlyBefore: earlyBefore || null,
      });
      if (!res.ok) {
        setSchedError(res.error ?? "Could not save schedule.");
        return;
      }
      fireToast({ message: `${employee.name}'s attendance schedule saved.` });
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit employee
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            {employee.email}
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field label="Task role">
              <Select
                value={role}
                onValueChange={(v) => setRole(v as Role)}
                options={[
                  { value: "doer", label: "Doer" },
                  { value: "initiator", label: "Initiator" },
                  { value: "both", label: "Both" },
                ]}
              />
            </Field>
            <Field label="Manager">
              <Select
                value={managerId ?? ""}
                onValueChange={(v) => setManagerId(v || null)}
                searchable
                options={[
                  { value: "", label: "— None —" },
                  ...managerOptions
                    .filter((o) => o.value !== employee.id)
                    .map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
            </Field>
            <Field label="Departments (optional)">
              <DepartmentMultiSelect
                options={departmentOptions}
                selectedIds={deptIds}
                primaryId={primaryId}
                onChange={(ids, primary) => {
                  setDeptIds(ids);
                  setPrimaryId(primary);
                }}
              />
            </Field>
            <Field label="WhatsApp phone (E.164, optional)">
              <input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="+919820062511"
                maxLength={20}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <label className="flex items-start gap-2.5 text-[15px] text-[#334155]" style={{ lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={waOptIn}
                onChange={(e) => setWaOptIn(e.target.checked)}
                className="mt-1.5 h-4 w-4"
              />
              <span>
                <span className="font-semibold text-[#0F172A]">
                  I have this employee&apos;s consent to send WhatsApp notifications
                </span>
                <span className="block text-[13px] text-[#64748B] mt-0.5">
                  Required by Meta + DPDP — leave off if the employee hasn&apos;t agreed.
                </span>
              </span>
            </label>
            {canManageAdmins ? (
              <label
                className={`flex items-center gap-2.5 text-[15px] text-[#334155] ${
                  isSelf ? "opacity-60 cursor-not-allowed" : ""
                }`}
                title={isSelf ? "You can't remove your own admin role." : undefined}
              >
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  disabled={isSelf}
                  className="h-4 w-4"
                />
                Admin (can manage employees + settings)
              </label>
            ) : employee.isAdmin ? (
              // Non-super-admins see the status read-only with a hint, never an
              // editable control. The server guard is the real boundary.
              <div className="flex items-center gap-2.5 text-[15px] text-[#334155] opacity-70">
                <input type="checkbox" checked readOnly disabled className="h-4 w-4" />
                <span>
                  Admin
                  <span className="block text-[13px] text-[#64748B]">
                    Only Hetesh or Manan can change admin access.
                  </span>
                </span>
              </div>
            ) : null}
            <label className="flex items-start gap-2.5 text-[15px] text-[#334155]" style={{ lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={bioExempt}
                onChange={(e) => setBioExempt(e.target.checked)}
                className="mt-1.5 h-4 w-4"
              />
              <span>
                <span className="font-semibold text-[#0F172A]">
                  Exempt from biometric attendance
                </span>
                <span className="block text-[13px] text-[#64748B] mt-0.5">
                  Only for employees whose phone has no fingerprint/Face-ID
                  sensor. They&apos;ll punch with location only — everyone else
                  must use biometric. Leave off unless needed.
                </span>
              </span>
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}

            {/* ── Attendance schedule (Task A5) ─────────────────────────────
                Saved independently of the main form via its own action so an
                admin can tweak just the schedule without re-submitting the
                identity fields. */}
            <div className="pt-4 mt-2 border-t border-[#E2E8F0]">
              <div className="text-[14px] font-semibold text-[#0F172A]">
                Attendance schedule
              </div>
              <p className="text-[13px] text-[#64748B] mt-0.5" style={{ lineHeight: 1.5 }}>
                Leave the times blank to use the company defaults
                (late after 10:50, leave before 19:20).
              </p>
              <div className="mt-3 space-y-4">
                <Field label="Weekly off">
                  <Select
                    value={String(weeklyOff)}
                    onValueChange={(v) => setWeeklyOff(Number(v))}
                    options={WEEKDAY_OPTIONS}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Official start">
                    <TimeInput value={offStart} onChange={setOffStart} placeholder="10:00" />
                  </Field>
                  <Field label="Late after">
                    <TimeInput value={lateAfter} onChange={setLateAfter} placeholder="10:50" />
                  </Field>
                  <Field label="Official end">
                    <TimeInput value={offEnd} onChange={setOffEnd} placeholder="19:00" />
                  </Field>
                  <Field label="Early before">
                    <TimeInput value={earlyBefore} onChange={setEarlyBefore} placeholder="19:20" />
                  </Field>
                </div>
                {schedError && (
                  <div
                    role="alert"
                    className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
                  >
                    {schedError}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onSaveSchedule}
                    disabled={schedPending}
                    className="rounded-md py-2 px-4 text-[14px] font-medium text-[#0F172A] border border-[#CBD5E1] bg-white hover:border-[#94A3B8] transition-colors disabled:opacity-50"
                  >
                    {schedPending ? "Saving…" : "Save schedule"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function TimeInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-[#CBD5E1] px-3 py-2.5 text-[15px] tabular-nums"
    />
  );
}
