"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { inviteEmployee } from "@/app/(admin)/admin/employees/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import {
  DepartmentMultiSelect,
  type DepartmentOption,
} from "@/components/admin/department-multi-select";

interface InviteEmployeeDialogProps {
  departmentOptions: DepartmentOption[];
  /**
   * The designations, with their employee-type flag (0244). Needed HERE, before
   * any employee row exists: the designation is what decides whether this hire
   * is an intern, and therefore whether the form must ask for a Probation End
   * Date or an Internship Start Date.
   */
  designationOptions?: { id: string; name: string; employeeType: string }[];
  /** True only for super-admins (Hetesh / Manan) — gates the admin toggle. */
  canManageAdmins: boolean;
}

export function InviteEmployeeDialog({
  departmentOptions,
  designationOptions = [],
  canManageAdmins,
}: InviteEmployeeDialogProps) {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState<"doer" | "initiator" | "both">("doer");
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  /* ── 0244 · EMPLOYEE TYPE, PROBATION AND INTERNSHIP ─────────────────────
     All four are required for a NON-INTERN before the server will create the
     account, so they are part of the form rather than a follow-up edit — the
     server refuses an invite with no Probation End Date, and a form that could
     not supply one would simply be broken. */
  const [designationId, setDesignationId] = useState<string | null>(null);
  const [kindOverride, setKindOverride] = useState<string>(""); // "" = follow designation
  const [probationEnd, setProbationEnd] = useState("");
  const [internshipStart, setInternshipStart] = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** The EFFECTIVE type for the hire about to be created: the override if one was
   *  picked, else the chosen designation's flag, else employee. Mirrors
   *  `resolveEmployeeType` on the server — which is what actually decides. */
  const effectiveKind =
    kindOverride !== ""
      ? kindOverride
      : (designationOptions.find((d) => d.id === designationId)?.employeeType ?? "employee");
  const isInternHire = effectiveKind === "intern";

  function reset() {
    setName(""); setEmail(""); setRole("doer");
    setDeptIds([]); setPrimaryId(null);
    setIsAdmin(false); setError(null);
    setDesignationId(null); setKindOverride("");
    setProbationEnd(""); setInternshipStart("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Checked here as well as on the server so the admin gets the message beside
    // the form rather than after a round trip — the server is still the gate.
    if (!isInternHire && !probationEnd) {
      setError("Set the Probation End Date before saving this employee.");
      return;
    }
    if (isInternHire && !internshipStart) {
      setError("Set the Internship Start Date for an intern.");
      return;
    }
    startTransition(async () => {
      const res = await inviteEmployee({
        name,
        email,
        role,
        departmentIds: deptIds,
        primaryDepartmentId: primaryId,
        isAdmin,
        designationId,
        employeeType: kindOverride === "" ? null : (kindOverride as "employee" | "intern"),
        probationEnd: probationEnd || null,
        internshipStart: internshipStart || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      // Surface the email-send warning if the account was created but
      // the invite email failed — the admin needs to know to resend.
      if (res.warning) {
        fireToast({ message: res.warning });
      } else {
        fireToast({ message: `Invite sent to ${email}.` });
      }
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Dialog.Trigger asChild>
        <button
          className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white"
          style={{
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            boxShadow: "0 4px 14px rgba(225, 6, 0, 0.32)",
          }}
        >
          + Invite Employee
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Invite Employee
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            They'll receive an email to set their password.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full Name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field label="Work Email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field label="Task Role">
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "doer" | "initiator" | "both")}
                options={[
                  { value: "doer", label: "Doer" },
                  { value: "initiator", label: "Initiator" },
                  { value: "both", label: "Both" },
                ]}
              />
            </Field>
            <Field label="Functions (optional)">
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

            {/* ── 0244 · EMPLOYEE TYPE ────────────────────────────────────────
                The designation decides employee type, and employee type decides
                both the internship rule and whether this person can earn
                incentives. So the designation is asked for at CREATION rather
                than left to a later edit — without it there is nothing to
                inherit from and the date fields below have no answer. */}
            {designationOptions.length > 0 && (
              <>
                <Field label="Designation">
                  <Select
                    value={designationId ?? ""}
                    onValueChange={(v) => setDesignationId(v || null)}
                    placeholder="—"
                    options={designationOptions.map((d) => ({
                      value: d.id,
                      label: `${d.name}${d.employeeType === "intern" ? " (Intern)" : ""}`,
                    }))}
                  />
                </Field>
                <Field label="Employee Type">
                  <Select
                    value={kindOverride}
                    onValueChange={setKindOverride}
                    options={[
                      {
                        value: "",
                        label: `Follow designation (${
                          designationOptions.find((d) => d.id === designationId)?.employeeType === "intern"
                            ? "Intern"
                            : "Employee"
                        })`,
                      },
                      { value: "employee", label: "Employee" },
                      { value: "intern", label: "Intern" },
                    ]}
                  />
                  <p className="mt-1 text-[12.5px] text-[#64748B]">
                    Interns do not earn incentives.
                  </p>
                </Field>
              </>
            )}

            {/* An INTERN starts an internship instead of a probation, so exactly
                one of the two dates is asked for — the rule the server enforces,
                shown on the form that has to satisfy it. */}
            {isInternHire ? (
              <Field label="Internship Start Date">
                <input
                  type="date"
                  value={internshipStart}
                  onChange={(e) => setInternshipStart(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
                />
                <p className="mt-1 text-[12.5px] text-[#64748B]">
                  The internship end is start + 6 months, calculated automatically.
                </p>
              </Field>
            ) : (
              <Field label="Probation End Date *">
                <input
                  type="date"
                  value={probationEnd}
                  onChange={(e) => setProbationEnd(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
                />
                <p className="mt-1 text-[12.5px] text-[#64748B]">
                  Required — the employee record cannot be saved without it.
                </p>
              </Field>
            )}
            {canManageAdmins && (
              <label className="flex items-center gap-2.5 text-[15px] text-[#334155]">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="h-4 w-4"
                />
                Admin (can manage employees + settings)
              </label>
            )}
            {error && <div className="text-[14px] text-[#A80400]">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="brand-btn px-4 py-2.5 text-[14px] font-medium text-[#64748B]">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
                  boxShadow: "0 4px 14px rgba(225, 6, 0, 0.32)",
                }}
              >
                {pending ? "Sending…" : "Send Invite"}
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
