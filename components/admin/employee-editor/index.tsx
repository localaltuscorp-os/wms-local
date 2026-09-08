"use client";

import { useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  bulkEditEmployees,
  editEmployee,
  updateEmployeeAttendanceSchedule,
} from "@/app/(admin)/admin/employees/actions";
import type { BulkEditFailure } from "@/app/(admin)/admin/employees/actions";
import type { BulkEditEmployeesInput } from "@/lib/validators/employee";
import { Select } from "@/components/ui/select";
import {
  DepartmentMultiSelect,
  type DepartmentOption,
} from "@/components/admin/department-multi-select";
import {
  asWorkerType,
  isHalfDayShift,
  isHourlyShift,
  type WorkerType,
} from "@/lib/attendance/worker-type";
import { Alert, Card, Field, NO_CHANGE, Note, NumberInput, inputClass } from "./primitives";
import { ScheduleFields, type ScheduleDraft } from "./schedule-fields";

/**
 * THE EMPLOYEE EDITOR — one component, two modes.
 *
 *   mode="single" → Edit Employee, every control pre-filled from that person.
 *   mode="bulk"   → Edit N Employees, every control starts at "No Change" and
 *                   only the ones actually touched are submitted.
 *
 * ONE COMPONENT ON PURPOSE. The sections, spacing, controls, two-column split
 * and footer are defined once, so the bulk editor cannot drift into being a
 * different-looking product. The mode flag changes what a field's EMPTY state
 * means, not how it is drawn.
 *
 * ── WHAT IT SAVES ─────────────────────────────────────────────────────────
 * Nothing new. Single mode calls the existing `editEmployee` and
 * `updateEmployeeAttendanceSchedule`; bulk calls `bulkEditEmployees`, which
 * loops those same two actions. There is no second write path, no duplicated
 * employee state, and no schedule value cached anywhere else — the Admin Panel
 * stays the authoritative configuration Attendance reads.
 *
 * ── ONE SAVE BUTTON ───────────────────────────────────────────────────────
 * The old dialog had a separate "Save Schedule" that wrote independently of
 * "Save Changes", so an admin could edit both halves, hit one button, and lose
 * the other half without being told. Now a single submit builds BOTH patches and
 * sends whichever are non-empty.
 */

type Role = "doer" | "initiator" | "both";

export interface EmployeeDepartmentMembership {
  id: string;
  name: string;
  isPrimary: boolean;
}

/** Everything the editor reads for one employee. Mirrors the row the list holds. */
export interface EditableEmployee {
  id: string;
  name: string;
  email: string;
  role: Role;
  departments: EmployeeDepartmentMembership[];
  isAdmin: boolean;
  phone: string | null;
  whatsappPhone: string | null;
  /** WhatsApp consent — gates whether we may message them at all. */
  whatsappOptedIn: boolean;
  managerId?: string | null;
  dailyTaskQuota?: number;
  attendanceBiometricExempt: boolean;
  weeklyOff: number;
  attOfficialStart: string | null;
  attLateAfter: string | null;
  attOfficialEnd: string | null;
  attEarlyBefore: string | null;
  workerType: string;
  attFullDayMinutes: number | null;
  attHalfDayMinutes: number | null;
  weeklyTargetMinutes: number | null;
  monthlyPayAtTarget: string | null;
  weeklyTargetHours: string | null;
  monthlyFee: string | null;
}

export type EmployeeEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentOptions: DepartmentOption[];
  managerOptions: { value: string; label: string }[];
  /** True only for super-admins — gates the admin toggle (single mode only). */
  canManageAdmins: boolean;
} & (
  | { mode: "single"; employee: EditableEmployee; isSelf: boolean }
  | { mode: "bulk"; employees: EditableEmployee[] }
);

const ROLE_OPTIONS = [
  { value: "doer", label: "Doer" },
  { value: "initiator", label: "Initiator" },
  { value: "both", label: "Both" },
];

/** Compare two id lists as sets (order-independent). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/** Postgres `time` reads back "HH:mm:ss"; the native input needs "HH:mm". */
function toHHmm(v: string | null): string {
  return v ? v.slice(0, 5) : "";
}

/** Minutes → hours string for the number inputs. 300 → "5". Null → "". */
function minutesToHours(v: number | null): string {
  return v == null ? "" : String(v / 60);
}

/** numeric-column string → plain number string. "3500.00" → "3500". */
function numToInput(v: string | null): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

/** Hours string → minutes int, blank/invalid → null. */
function hoursToMinutes(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : null;
}

/** Non-negative number string → number, blank/invalid → null. */
function toMoney(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function EmployeeEditor(props: EmployeeEditorProps) {
  const { open, onOpenChange, departmentOptions, managerOptions, canManageAdmins } = props;
  const bulk = props.mode === "bulk";
  const targets = bulk ? props.employees : [props.employee];
  const one = bulk ? null : props.employee;

  /* ── Identity + organisation ─────────────────────────────────────────── */
  const [name, setName] = useState(one?.name ?? "");
  const [role, setRole] = useState<Role | null>(one?.role ?? null);
  const [managerId, setManagerId] = useState<string | null | undefined>(
    bulk ? undefined : (one?.managerId ?? null),
  );
  const [quota, setQuota] = useState<number | null>(
    bulk ? null : (one?.dailyTaskQuota ?? 3),
  );
  const [changeDepts, setChangeDepts] = useState(!bulk);
  const [deptIds, setDeptIds] = useState<string[]>(
    one ? one.departments.map((d) => d.id) : [],
  );
  const [primaryId, setPrimaryId] = useState<string | null>(
    one?.departments.find((d) => d.isPrimary)?.id ?? one?.departments[0]?.id ?? null,
  );
  const [isAdmin, setIsAdmin] = useState(one?.isAdmin ?? false);
  const [waPhone, setWaPhone] = useState(one?.whatsappPhone ?? "");
  const [waOptIn, setWaOptIn] = useState<boolean | null>(
    bulk ? null : (one?.whatsappOptedIn ?? false),
  );

  /* ── Schedule ─────────────────────────────────────────────────────────── */
  const [sched, setSched] = useState<ScheduleDraft>(() =>
    bulk
      ? {
          workerType: null,
          weeklyOff: null,
          offStart: null,
          lateAfter: null,
          offEnd: null,
          earlyBefore: null,
        }
      : {
          workerType: asWorkerType(one!.workerType),
          weeklyOff: one!.weeklyOff,
          offStart: toHHmm(one!.attOfficialStart),
          lateAfter: toHHmm(one!.attLateAfter),
          offEnd: toHHmm(one!.attOfficialEnd),
          earlyBefore: toHHmm(one!.attEarlyBefore),
        },
  );
  const [fullDayHours, setFullDayHours] = useState(minutesToHours(one?.attFullDayMinutes ?? null));
  const [halfDayHours, setHalfDayHours] = useState(minutesToHours(one?.attHalfDayMinutes ?? null));
  const [weeklyHours, setWeeklyHours] = useState(
    numToInput(one?.weeklyTargetHours ?? null) ||
      minutesToHours(one?.weeklyTargetMinutes ?? null),
  );
  const [payAtTarget, setPayAtTarget] = useState(numToInput(one?.monthlyPayAtTarget ?? null));
  const [monthlyFee, setMonthlyFee] = useState(numToInput(one?.monthlyFee ?? null));

  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failures, setFailures] = useState<BulkEditFailure[] | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * NO STATE-SYNC EFFECT ON PURPOSE.
   *
   * The old dialog stayed mounted and re-seeded ~20 useState values from an
   * effect every time it opened, which is both a cascading-render smell and the
   * exact mechanism by which one row's values used to bleed into the next row
   * opened. Callers mount this component only while it is open and key it by the
   * target ids instead, so every open is a fresh mount and the useState
   * initialisers above ARE the seeding. Closing throws the draft away, which is
   * what Cancel should do anyway.
   */

  /** Seed sensible defaults when switching worker type and the field is blank. */
  function onWorkerType(next: WorkerType | null) {
    setSched((s) => ({ ...s, workerType: next }));
    if (next === "second_half") {
      setSched((s) => ({ ...s, lateAfter: s.lateAfter || "15:30" }));
      // Same 27h week as the other short shifts — it starts later, it is not longer.
      setWeeklyHours((v) => v || "27");
    } else if (next === "first_half") {
      // The morning mirror: same short week, but it starts with the day, so the
      // late cutoff seeds from the full-timer's rather than the afternoon's.
      setWeeklyHours((v) => v || "27");
    } else if (next === "hybrid") {
      setWeeklyHours((v) => v || "27");
      setPayAtTarget((v) => v || "3500");
    }
  }

  /* ── The bulk patch: ONLY the keys the admin touched. ─────────────────── */
  const bulkPatch = useMemo((): BulkEditEmployeesInput => {
    const p: BulkEditEmployeesInput = {};
    if (role !== null) p.role = role;
    if (managerId !== undefined) p.managerId = managerId;
    if (quota !== null) p.dailyTaskQuota = quota;
    if (waOptIn !== null) p.whatsappOptedIn = waOptIn;
    if (changeDepts) {
      p.departmentIds = deptIds;
      p.primaryDepartmentId = primaryId;
    }
    if (sched.workerType !== null) p.workerType = sched.workerType;
    if (sched.weeklyOff !== null) p.weeklyOff = sched.weeklyOff;
    if (sched.offStart !== null) p.attOfficialStart = sched.offStart;
    if (sched.lateAfter !== null) p.attLateAfter = sched.lateAfter;
    if (sched.offEnd !== null) p.attOfficialEnd = sched.offEnd;
    if (sched.earlyBefore !== null) p.attEarlyBefore = sched.earlyBefore;
    return p;
  }, [role, managerId, quota, waOptIn, changeDepts, deptIds, primaryId, sched]);

  /** Human list of what the bulk apply will actually change. */
  const bulkChanges = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    const p = bulkPatch;
    const blank = "(company default)";
    if (p.role) out.push({ label: "Task Role", value: ROLE_OPTIONS.find((r) => r.value === p.role)!.label });
    if (p.managerId !== undefined) {
      out.push({
        label: "Manager",
        value: p.managerId
          ? (managerOptions.find((m) => m.value === p.managerId)?.label ?? "-")
          : "None",
      });
    }
    if (p.dailyTaskQuota !== undefined) out.push({ label: "Daily task quota", value: String(p.dailyTaskQuota) });
    if (p.whatsappOptedIn !== undefined) {
      out.push({ label: "WhatsApp consent", value: p.whatsappOptedIn ? "Given" : "Not given" });
    }
    if (p.departmentIds !== undefined) {
      const names = p.departmentIds
        .map((id) => departmentOptions.find((d) => d.id === id)?.name ?? id)
        .join(", ");
      out.push({ label: "Departments", value: names || "None" });
    }
    if (p.workerType) {
      out.push({
        label: "Employee Type",
        value: p.workerType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      });
    }
    if (p.weeklyOff !== undefined) out.push({ label: "Weekly Off", value: WEEKDAY_NAMES[p.weeklyOff] ?? "-" });
    if (p.attOfficialStart !== undefined) out.push({ label: "Official Start", value: p.attOfficialStart || blank });
    if (p.attLateAfter !== undefined) out.push({ label: "Late After", value: p.attLateAfter || blank });
    if (p.attOfficialEnd !== undefined) out.push({ label: "Official End", value: p.attOfficialEnd || blank });
    if (p.attEarlyBefore !== undefined) out.push({ label: "Early Before", value: p.attEarlyBefore || blank });
    return out;
  }, [bulkPatch, managerOptions, departmentOptions]);

  /* ── Submit ───────────────────────────────────────────────────────────── */

  function submitSingle() {
    const e = props.mode === "single" ? props.employee : null;
    if (!e) return;
    setError(null);

    const initialDeptIds = e.departments.map((d) => d.id);
    const initialPrimary =
      e.departments.find((d) => d.isPrimary)?.id ?? e.departments[0]?.id ?? null;

    const patch: Parameters<typeof editEmployee>[1] = {};
    const trimmedName = name.trim();
    if (trimmedName !== e.name) patch.name = trimmedName;
    if (role && role !== e.role) patch.role = role;
    if (!sameSet(deptIds, initialDeptIds) || primaryId !== initialPrimary) {
      patch.departmentIds = deptIds;
      patch.primaryDepartmentId = primaryId;
    }
    if (isAdmin !== e.isAdmin) patch.isAdmin = isAdmin;
    if ((managerId ?? null) !== (e.managerId ?? null)) patch.managerId = managerId ?? null;
    if (quota !== null && quota !== (e.dailyTaskQuota ?? 3)) patch.dailyTaskQuota = quota;
    const trimmedPhone = waPhone.trim();
    if (trimmedPhone !== (e.whatsappPhone ?? "")) {
      patch.whatsappPhone = trimmedPhone === "" ? null : trimmedPhone;
    }
    if (waOptIn !== null && waOptIn !== e.whatsappOptedIn) patch.whatsappOptedIn = waOptIn;

    // The schedule half is compared the same way, so an untouched schedule does
    // not burn a write (and does not stamp a no-op audit event).
    const wt = sched.workerType ?? asWorkerType(e.workerType);
    const scheduleChanged =
      wt !== asWorkerType(e.workerType) ||
      (sched.weeklyOff ?? e.weeklyOff) !== e.weeklyOff ||
      (sched.offStart ?? "") !== toHHmm(e.attOfficialStart) ||
      (sched.lateAfter ?? "") !== toHHmm(e.attLateAfter) ||
      (sched.offEnd ?? "") !== toHHmm(e.attOfficialEnd) ||
      (sched.earlyBefore ?? "") !== toHHmm(e.attEarlyBefore) ||
      hoursToMinutes(fullDayHours) !== e.attFullDayMinutes ||
      hoursToMinutes(halfDayHours) !== e.attHalfDayMinutes ||
      toMoney(payAtTarget) !== (e.monthlyPayAtTarget ? Number(e.monthlyPayAtTarget) : null) ||
      toMoney(weeklyHours) !== (e.weeklyTargetHours ? Number(e.weeklyTargetHours) : null) ||
      toMoney(monthlyFee) !== (e.monthlyFee ? Number(e.monthlyFee) : null);

    if (Object.keys(patch).length === 0 && !scheduleChanged) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      if (Object.keys(patch).length > 0) {
        const res = await editEmployee(e.id, patch);
        if (!res.ok) {
          setError(res.error ?? "Something went wrong");
          return;
        }
      }
      if (scheduleChanged) {
        const res = await updateEmployeeAttendanceSchedule({
          employeeId: e.id,
          weeklyOff: sched.weeklyOff ?? e.weeklyOff,
          attOfficialStart: sched.offStart || null,
          attLateAfter: sched.lateAfter || null,
          attOfficialEnd: sched.offEnd || null,
          attEarlyBefore: sched.earlyBefore || null,
          workerType: wt,
          attFullDayMinutes: isHalfDayShift(wt) ? hoursToMinutes(fullDayHours) : null,
          attHalfDayMinutes: isHalfDayShift(wt) ? hoursToMinutes(halfDayHours) : null,
          // Every hourly shift carries an admin-set weekly target.
          // `monthly_pay_at_target` stays hybrid-only: a half-day-shift employee is
          // on a CTC, so writing a second monthly figure for them would be a second
          // source of truth for the same salary.
          weeklyTargetMinutes: isHourlyShift(wt) ? hoursToMinutes(weeklyHours) : null,
          monthlyPayAtTarget: wt === "hybrid" ? toMoney(payAtTarget) : null,
          weeklyTargetHours: isHourlyShift(wt) ? toMoney(weeklyHours) : null,
          monthlyFee: wt === "project_remote" ? toMoney(monthlyFee) : null,
        });
        if (!res.ok) {
          setError(res.error ?? "Could not save the schedule.");
          return;
        }
      }
      fireToast({ message: `${trimmedName || e.name} updated.` });
      onOpenChange(false);
    });
  }

  function applyBulk() {
    setError(null);
    setFailures(null);
    startTransition(async () => {
      const res = await bulkEditEmployees(
        targets.map((t) => t.id),
        bulkPatch,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.failed.length > 0) {
        setFailures(res.failed);
        setError(
          `Updated ${res.updated} of ${targets.length}. ${res.failed.length} failed.`,
        );
        return;
      }
      fireToast({ message: `✓ Updated ${res.updated} employees successfully` });
      onOpenChange(false);
    });
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  const title = bulk ? `Edit ${targets.length} Employees` : "Edit Employee";
  const subtitle = bulk
    ? `${targets.length} selected`
    : (one?.email ?? "");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[100] flex w-[min(1120px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-xl"
          style={{ height: "min(86vh, 900px)" }}
        >
          {/* Header — fixed. */}
          <div className="flex items-start gap-3 border-b border-hairline px-6 py-4 max-md:px-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-serif text-[22px] leading-tight text-ink-strong">
                {title}
              </Dialog.Title>
              <p className="mt-0.5 truncate text-[14px] text-ink-subtle">{subtitle}</p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-[#F1F5F9] hover:text-ink-strong"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body — the only scrolling region. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-4">
            {bulk ? (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {targets.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center rounded-pill bg-[#F1F5F9] px-2.5 py-1 text-[12px] font-semibold text-[#334155]"
                      style={{ boxShadow: "inset 0 0 0 1px #CBD5E1" }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
                <Note>
                  Only fields you change will be applied. Existing values will remain
                  unchanged.
                </Note>
              </div>
            ) : null}

            {confirming ? (
              <BulkConfirm
                count={targets.length}
                changes={bulkChanges}
              />
            ) : (
              <div className="grid grid-cols-[55fr_45fr] gap-5 max-lg:grid-cols-1">
                {/* LEFT ── identity, organisation, contact. */}
                <div className="space-y-4">
                  <Card title="Basic Information">
                    <Field
                      label="Full Name"
                      hint={bulk ? "Per-person - not available in bulk edit." : undefined}
                    >
                      <input
                        value={bulk ? "" : name}
                        disabled={bulk}
                        placeholder={bulk ? "No Change" : undefined}
                        onChange={(ev) => setName(ev.target.value)}
                        maxLength={80}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Task Role">
                      <Select
                        value={role ?? NO_CHANGE}
                        onValueChange={(v) => setRole(v === NO_CHANGE ? null : (v as Role))}
                        options={
                          bulk
                            ? [{ value: NO_CHANGE, label: "No Change" }, ...ROLE_OPTIONS]
                            : ROLE_OPTIONS
                        }
                      />
                    </Field>
                    <Field label="Manager">
                      <Select
                        value={managerId === undefined ? NO_CHANGE : (managerId ?? "")}
                        onValueChange={(v) =>
                          setManagerId(v === NO_CHANGE ? undefined : v || null)
                        }
                        searchable
                        options={[
                          ...(bulk ? [{ value: NO_CHANGE, label: "No Change" }] : []),
                          { value: "", label: "- None -" },
                          ...managerOptions.filter((o) => o.value !== one?.id),
                        ]}
                      />
                    </Field>
                    <Field label="Daily tasks their manager must give them (#11 gate)">
                      <BulkNumber
                        bulk={bulk}
                        value={quota}
                        onChange={setQuota}
                        max={50}
                      />
                    </Field>
                  </Card>

                  <Card title="Organization">
                    <Field
                      label="Departments"
                      hint="The starred department is the primary one."
                    >
                      {bulk && !changeDepts ? (
                        <button
                          type="button"
                          onClick={() => setChangeDepts(true)}
                          className={`${inputClass} cursor-pointer text-left text-ink-subtle`}
                        >
                          No Change
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <DepartmentMultiSelect
                            options={departmentOptions}
                            selectedIds={deptIds}
                            primaryId={primaryId}
                            onChange={(ids, primary) => {
                              setDeptIds(ids);
                              setPrimaryId(primary);
                            }}
                          />
                          {bulk ? (
                            <button
                              type="button"
                              onClick={() => {
                                setChangeDepts(false);
                                setDeptIds([]);
                                setPrimaryId(null);
                              }}
                              className="text-[12px] font-semibold text-ink-subtle underline-offset-2 hover:text-ink-strong hover:underline"
                            >
                              Revert to No Change
                            </button>
                          ) : null}
                        </div>
                      )}
                    </Field>
                    {!bulk && canManageAdmins ? (
                      <label
                        className={`flex items-center gap-2.5 text-[14px] text-ink-soft ${
                          props.mode === "single" && props.isSelf
                            ? "cursor-not-allowed opacity-60"
                            : ""
                        }`}
                        title={
                          props.mode === "single" && props.isSelf
                            ? "You can't remove your own admin role."
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isAdmin}
                          onChange={(ev) => setIsAdmin(ev.target.checked)}
                          disabled={props.mode === "single" && props.isSelf}
                          className="size-4 accent-[var(--color-altus-red)]"
                        />
                        Admin (can manage employees + settings)
                      </label>
                    ) : !bulk && one?.isAdmin ? (
                      <div className="flex items-center gap-2.5 text-[14px] text-ink-soft opacity-70">
                        <input type="checkbox" checked readOnly disabled className="size-4" />
                        <span>
                          Admin
                          <span className="block text-[12px] text-ink-subtle">
                            Only Hetesh or Manan can change admin access.
                          </span>
                        </span>
                      </div>
                    ) : null}
                  </Card>

                  <Card title="Contact & Notifications">
                    <Field
                      label="WhatsApp Phone (E.164)"
                      hint={bulk ? "Per-person - not available in bulk edit." : undefined}
                    >
                      <input
                        value={bulk ? "" : waPhone}
                        disabled={bulk}
                        onChange={(ev) => setWaPhone(ev.target.value)}
                        placeholder={bulk ? "No Change" : "+919820062511"}
                        maxLength={20}
                        className={inputClass}
                      />
                    </Field>
                    {bulk ? (
                      <Field
                        label="WhatsApp consent"
                        hint="Required by Meta + DPDP - only set this where the employee has agreed."
                      >
                        <Select
                          value={waOptIn === null ? NO_CHANGE : waOptIn ? "yes" : "no"}
                          onValueChange={(v) =>
                            setWaOptIn(v === NO_CHANGE ? null : v === "yes")
                          }
                          options={[
                            { value: NO_CHANGE, label: "No Change" },
                            { value: "yes", label: "Consent given" },
                            { value: "no", label: "No consent" },
                          ]}
                        />
                      </Field>
                    ) : (
                      <label
                        className="flex items-start gap-2.5 text-[14px] text-ink-soft"
                        style={{ lineHeight: 1.5 }}
                      >
                        <input
                          type="checkbox"
                          checked={waOptIn ?? false}
                          onChange={(ev) => setWaOptIn(ev.target.checked)}
                          className="mt-1 size-4 accent-[var(--color-altus-red)]"
                        />
                        <span>
                          <span className="font-semibold text-ink-strong">
                            I have this employee&apos;s consent to send WhatsApp
                            notifications
                          </span>
                          <span className="mt-0.5 block text-[12px] text-ink-subtle">
                            Required by Meta + DPDP - leave off if the employee hasn&apos;t
                            agreed.
                          </span>
                        </span>
                      </label>
                    )}
                  </Card>
                </div>

                {/* RIGHT ── schedule + live summary. */}
                <div className="space-y-4">
                  <ScheduleFields
                    bulk={bulk}
                    draft={sched}
                    previewWorkerType={
                      sched.workerType ?? asWorkerType(one?.workerType ?? "full_time")
                    }
                    onChange={(patch) =>
                      "workerType" in patch
                        ? onWorkerType(patch.workerType ?? null)
                        : setSched((s) => ({ ...s, ...patch }))
                    }
                    extras={
                      bulk ? null : (
                        <SingleModeExtras
                          workerType={sched.workerType ?? "full_time"}
                          fullDayHours={fullDayHours}
                          setFullDayHours={setFullDayHours}
                          halfDayHours={halfDayHours}
                          setHalfDayHours={setHalfDayHours}
                          weeklyHours={weeklyHours}
                          setWeeklyHours={setWeeklyHours}
                          payAtTarget={payAtTarget}
                          setPayAtTarget={setPayAtTarget}
                          monthlyFee={monthlyFee}
                          setMonthlyFee={setMonthlyFee}
                        />
                      )
                    }
                  />
                </div>
              </div>
            )}

            {error ? <div className="mt-4">
              <Alert>{error}</Alert>
            </div> : null}

            {failures && failures.length > 0 ? (
              <div className="mt-3 rounded-md border border-hairline bg-[#F8FAFC] p-3">
                <div className="mb-1.5 text-[13px] font-bold text-ink-strong">
                  Could not update:
                </div>
                <ul className="space-y-1">
                  {failures.map((f) => (
                    <li key={f.id} className="text-[13px] text-ink-soft">
                      <b>{f.name}</b> - {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Footer — fixed, always reachable. */}
          <div className="flex items-center justify-between gap-3 border-t border-hairline bg-white px-6 py-4 max-md:px-4">
            <button
              type="button"
              onClick={() => (confirming ? setConfirming(false) : onOpenChange(false))}
              disabled={pending}
              className="rounded-md px-4 py-2.5 text-[14px] font-semibold text-ink-subtle transition-colors hover:text-ink-strong disabled:opacity-50"
            >
              {confirming ? "Back" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={pending || (bulk && !confirming && bulkChanges.length === 0)}
              onClick={() => {
                if (!bulk) return submitSingle();
                if (!confirming) {
                  setError(null);
                  setConfirming(true);
                  return;
                }
                applyBulk();
              }}
              className="rounded-md px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-45"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              {pending
                ? "Saving…"
                : bulk
                  ? confirming
                    ? `Apply to ${targets.length} Employees`
                    : "Apply Changes"
                  : "Save Changes"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The bulk safety step — exactly what will change, and what will not. */
function BulkConfirm({
  count,
  changes,
}: {
  count: number;
  changes: { label: string; value: string }[];
}) {
  return (
    <div className="mx-auto max-w-xl">
      <h3 className="font-serif text-[20px] text-ink-strong">
        Apply changes to {count} {count === 1 ? "employee" : "employees"}?
      </h3>
      <ul className="mt-4 space-y-2">
        {changes.map((c) => (
          <li
            key={c.label}
            className="flex items-baseline justify-between gap-4 rounded-md border border-hairline bg-white px-3.5 py-2.5"
          >
            <span className="text-[13.5px] font-semibold text-ink-subtle">{c.label}</span>
            <span className="text-[14px] font-bold text-ink-strong">→ {c.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.6 }}>
        All other employee-specific values will remain unchanged.
      </p>
    </div>
  );
}

/** A number field that can also sit in a bulk "No Change" state. */
function BulkNumber({
  bulk,
  value,
  onChange,
  max,
}: {
  bulk: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
  max: number;
}) {
  if (bulk && value === null) {
    return (
      <input
        type="text"
        readOnly
        value="No Change"
        aria-label="No change"
        onFocus={() => onChange(0)}
        onClick={() => onChange(0)}
        className={`${inputClass} cursor-pointer text-ink-subtle`}
      />
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={max}
        value={value ?? 0}
        onChange={(e) =>
          onChange(Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))
        }
        className={`${inputClass} tabular-nums`}
      />
      {bulk ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Revert to No Change"
          className="shrink-0 rounded-md border border-hairline px-2 py-2 text-[12px] font-semibold text-ink-subtle transition-colors hover:text-ink-strong"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}

/**
 * The type-specific rate/threshold inputs, single mode only. These are NOT
 * bulk-editable on purpose — a shared rupee figure across a selection is never
 * what an admin means, and `bulkEditEmployees` carries each person's existing
 * values through untouched.
 */
function SingleModeExtras(p: {
  workerType: WorkerType;
  fullDayHours: string;
  setFullDayHours: (v: string) => void;
  halfDayHours: string;
  setHalfDayHours: (v: string) => void;
  weeklyHours: string;
  setWeeklyHours: (v: string) => void;
  payAtTarget: string;
  setPayAtTarget: (v: string) => void;
  monthlyFee: string;
  setMonthlyFee: (v: string) => void;
}) {
  if (isHalfDayShift(p.workerType)) {
    return (
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        {/* Same weekly target across the short shifts — a half-day slot is not a
            longer one. Editable here because it is what Attendance grades against
            and what overtime is measured from. */}
        <Field label="Weekly target hours">
          <NumberInput value={p.weeklyHours} onChange={p.setWeeklyHours} placeholder="27" step="0.5" />
        </Field>
        <Field label="Full-day hours">
          <NumberInput value={p.fullDayHours} onChange={p.setFullDayHours} placeholder="5" step="0.5" />
        </Field>
        <Field label="Half-day hours">
          <NumberInput value={p.halfDayHours} onChange={p.setHalfDayHours} placeholder="off" step="0.5" />
        </Field>
      </div>
    );
  }
  if (p.workerType === "hybrid") {
    return (
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <Field label="Weekly target hours">
          <NumberInput value={p.weeklyHours} onChange={p.setWeeklyHours} placeholder="27" step="0.5" />
        </Field>
        <Field label="Monthly pay at target ₹">
          <NumberInput value={p.payAtTarget} onChange={p.setPayAtTarget} placeholder="3500" step="1" />
        </Field>
      </div>
    );
  }
  if (p.workerType === "project_remote") {
    return (
      <Field label="Monthly fee ₹">
        <NumberInput value={p.monthlyFee} onChange={p.setMonthlyFee} placeholder="e.g. 15000" step="1" />
      </Field>
    );
  }
  return null;
}
