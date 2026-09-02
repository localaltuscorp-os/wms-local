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
  /** True only for super-admins (Hetesh / Manan) — gates the admin toggle. */
  canManageAdmins: boolean;
}

export function InviteEmployeeDialog({
  departmentOptions,
  canManageAdmins,
}: InviteEmployeeDialogProps) {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState<"doer" | "initiator" | "both">("doer");
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(""); setEmail(""); setRole("doer");
    setDeptIds([]); setPrimaryId(null);
    setIsAdmin(false); setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await inviteEmployee({
        name,
        email,
        role,
        departmentIds: deptIds,
        primaryDepartmentId: primaryId,
        isAdmin,
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
          + Invite employee
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Invite employee
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            They'll receive an email to set their password.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field label="Work email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field label="Task role">
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
                <button type="button" className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]">
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
                {pending ? "Sending…" : "Send invite"}
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
