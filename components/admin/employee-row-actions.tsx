"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  MoreHorizontal,
  MailPlus,
  UserX,
  UserCheck,
  Pencil,
  Trash2,
  AlertTriangle,
  Link2,
  KeyRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { fireToast } from "@/lib/toast";
import {
  resendInvite,
  deactivateEmployee,
  reactivateEmployee,
  deleteEmployee,
  getEmployeeDeletionImpact,
  getInviteLink,
  type EmployeeDeletionImpact,
} from "@/app/(admin)/admin/employees/actions";
import {
  EditEmployeeDialog,
  type EmployeeDepartmentMembership,
} from "@/components/admin/edit-employee-dialog";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import type { DepartmentOption } from "@/components/admin/department-multi-select";

type Role = "doer" | "initiator" | "both";

type RowEmployee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departments: EmployeeDepartmentMembership[];
  isAdmin: boolean;
  isActive: boolean;
  joinedAt: Date | null;
  whatsappPhone: string | null;
  whatsappOptedIn: boolean;
  managerId: string | null;
  attendanceBiometricExempt: boolean;
  weeklyOff: number;
  attOfficialStart: string | null;
  attLateAfter: string | null;
  attOfficialEnd: string | null;
  attEarlyBefore: string | null;
};

interface Props {
  employee: RowEmployee;
  isSelf: boolean;
  /** True only for super-admins (Hetesh / Manan) — gates the admin toggle. */
  canManageAdmins: boolean;
  departmentOptions: DepartmentOption[];
  managerOptions: { value: string; label: string }[];
}

type ConfirmKind = "deactivate" | "reactivate" | null;

export function EmployeeRowActions({
  employee,
  isSelf,
  canManageAdmins,
  departmentOptions,
  managerOptions,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<EmployeeDeletionImpact | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletePending, deleteStart] = useTransition();

  const isInvited = employee.joinedAt === null;
  const canDeactivate = employee.isActive && !isSelf;
  const canReactivate = !employee.isActive;
  const canDelete = !isSelf;

  // Fetch impact counts the moment the delete dialog opens — so the user sees
  // exactly what they're about to nuke before they type the email.
  useEffect(() => {
    if (!deleteOpen) {
      setDeleteImpact(null);
      setDeleteConfirmInput("");
      return;
    }
    let cancelled = false;
    getEmployeeDeletionImpact(employee.id).then((impact) => {
      if (!cancelled) setDeleteImpact(impact);
    });
    return () => {
      cancelled = true;
    };
  }, [deleteOpen, employee.id]);

  const confirmMatches =
    deleteConfirmInput.trim().toLowerCase() === employee.email.toLowerCase();

  function handleDelete() {
    if (!confirmMatches) return;
    deleteStart(async () => {
      const res = await deleteEmployee(employee.id, deleteConfirmInput);
      if (res.ok) {
        const d = res.deleted;
        fireToast({
          message: d
            ? `Deleted ${employee.name} — ${d.tasks} tasks, ${d.taskEvents} events.`
            : `Deleted ${employee.name}.`,
        });
        setDeleteOpen(false);
      } else {
        fireToast({ message: res.error ?? "Could not delete employee." });
      }
    });
  }

  function handleResend() {
    startTransition(async () => {
      const res = await resendInvite(employee.id);
      if (res.ok) {
        fireToast({ message: `Invite re-sent to ${employee.name}.` });
      } else {
        fireToast({ message: res.error ?? "Could not re-send invite." });
      }
    });
  }

  function handleCopyInviteLink() {
    startTransition(async () => {
      const res = await getInviteLink(employee.id);
      if (!res.ok || !res.link) {
        fireToast({ message: res.error ?? "Could not generate invite link." });
        return;
      }
      try {
        await navigator.clipboard.writeText(res.link);
        fireToast({
          message: `Invite link for ${employee.name} copied — paste anywhere to share. Expires in 1h.`,
        });
      } catch {
        // Clipboard write blocked (no permissions / insecure context).
        // Fall back to a window.prompt so admin can still grab the link.
        window.prompt(
          `Copy this invite link for ${employee.name} (expires in 1 hour):`,
          res.link,
        );
      }
    });
  }

  function handleConfirm() {
    if (confirm === null) return;
    const action = confirm;
    startTransition(async () => {
      const res =
        action === "deactivate"
          ? await deactivateEmployee(employee.id)
          : await reactivateEmployee(employee.id);
      setConfirm(null);
      if (res.ok) {
        fireToast({
          message:
            action === "deactivate"
              ? `${employee.name} has been deactivated.`
              : `${employee.name} has been reactivated.`,
        });
      } else {
        fireToast({
          message:
            res.error ??
            (action === "deactivate"
              ? "Could not deactivate employee."
              : "Could not reactivate employee."),
        });
      }
    });
  }

  // Edit + Copy link are always available, so we always render the trigger.
  // The "link" group (resend + copy) only makes sense while the account is
  // active — deactivated users can't sign in regardless.
  const canShareLink = employee.isActive;
  const canResetPassword = employee.isActive && !isSelf;
  const showSeparator = canShareLink || canDeactivate || canReactivate;
  const showDeleteSeparator = canDelete;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${employee.name}`}
            className="size-9 inline-flex items-center justify-center rounded-full hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] transition-colors disabled:opacity-50"
            disabled={pending}
          >
            <MoreHorizontal size={18} strokeWidth={2.2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil size={14} />
            Edit employee
          </DropdownMenuItem>
          {showSeparator && <DropdownMenuSeparator />}
          {isInvited && (
            <DropdownMenuItem onClick={handleResend}>
              <MailPlus size={14} />
              Resend invite
            </DropdownMenuItem>
          )}
          {canShareLink && (
            <DropdownMenuItem onClick={handleCopyInviteLink}>
              <Link2 size={14} />
              {isInvited ? "Copy invite link" : "Copy password-reset link"}
            </DropdownMenuItem>
          )}
          {canResetPassword && (
            <DropdownMenuItem onClick={() => setResetOpen(true)}>
              <KeyRound size={14} />
              Reset password
            </DropdownMenuItem>
          )}
          {canDeactivate && (
            <DropdownMenuItem danger onClick={() => setConfirm("deactivate")}>
              <UserX size={14} />
              Deactivate
            </DropdownMenuItem>
          )}
          {canReactivate && (
            <DropdownMenuItem onClick={() => setConfirm("reactivate")}>
              <UserCheck size={14} />
              Reactivate
            </DropdownMenuItem>
          )}
          {showDeleteSeparator && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem danger onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} />
              Delete permanently…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditEmployeeDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={{
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role: employee.role,
          departments: employee.departments,
          isAdmin: employee.isAdmin,
          whatsappPhone: employee.whatsappPhone,
          whatsappOptedIn: employee.whatsappOptedIn,
          managerId: employee.managerId,
          attendanceBiometricExempt: employee.attendanceBiometricExempt,
          weeklyOff: employee.weeklyOff,
          attOfficialStart: employee.attOfficialStart,
          attLateAfter: employee.attLateAfter,
          attOfficialEnd: employee.attOfficialEnd,
          attEarlyBefore: employee.attEarlyBefore,
        }}
        isSelf={isSelf}
        canManageAdmins={canManageAdmins}
        departmentOptions={departmentOptions}
        managerOptions={managerOptions}
      />

      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        employee={{ id: employee.id, name: employee.name }}
      />

      {/* Hard-delete dialog — typed-email gate prevents accidental clicks. */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[90]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
            <div className="flex items-start gap-3 mb-3">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "rgba(225, 6, 0, 0.10)",
                  color: "#A80400",
                }}
                aria-hidden
              >
                <AlertTriangle size={18} strokeWidth={2.3} />
              </span>
              <div className="min-w-0">
                <Dialog.Title className="font-serif text-xl text-[#0F172A]">
                  Delete {employee.name} permanently?
                </Dialog.Title>
                <Dialog.Description className="text-[13.5px] text-[#64748B] mt-1" style={{ lineHeight: 1.5 }}>
                  This destroys their Firebase login AND every task,
                  comment, and audit event tied to them. Other employees
                  who were initiators on those tasks will lose the work
                  too. <strong>Irreversible.</strong>
                </Dialog.Description>
              </div>
            </div>

            {deleteImpact === null ? (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13px] text-[#64748B] mb-4">
                Counting impact…
              </div>
            ) : !deleteImpact.ok ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-[#A80400] mb-4">
                {deleteImpact.error ?? "Could not load impact."}
              </div>
            ) : (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 mb-4">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#94A3B8] mb-2">
                  Will be deleted
                </div>
                <ul className="space-y-1 text-[13px] text-[#334155]">
                  <li className="flex justify-between"><span>Tasks owned (doer / initiator / creator)</span><span className="tabular-nums font-semibold">{deleteImpact.tasks}</span></li>
                  <li className="flex justify-between"><span>Task events authored</span><span className="tabular-nums font-semibold">{deleteImpact.taskEventsAsActor}</span></li>
                  <li className="flex justify-between"><span>Employee events authored</span><span className="tabular-nums font-semibold">{deleteImpact.employeeEventsAsActor}</span></li>
                  <li className="flex justify-between"><span>Settings events authored</span><span className="tabular-nums font-semibold">{deleteImpact.settingsEventsAsActor}</span></li>
                  <li className="flex justify-between text-[#64748B]"><span>Lifecycle events about them (cascade)</span><span className="tabular-nums">{deleteImpact.employeeEventsAboutThem}</span></li>
                  <li className="flex justify-between text-[#64748B]"><span>Inbox notifications (cascade)</span><span className="tabular-nums">{deleteImpact.notifications}</span></li>
                </ul>
              </div>
            )}

            <label className="block mb-2">
              <span className="block text-[13px] font-semibold text-[#334155] mb-1.5">
                Type <span className="font-mono text-[12.5px] text-[#A80400]">{employee.email}</span> to confirm
              </span>
              <input
                type="text"
                autoComplete="off"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#0F172A]/20"
                placeholder={employee.email}
                disabled={deletePending}
              />
            </label>

            <div className="flex justify-end gap-2 pt-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={deletePending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmMatches || deletePending}
                className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {deletePending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
            {confirm === "deactivate" ? (
              <>
                <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
                  Deactivate {employee.name}?
                </Dialog.Title>
                <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
                  They'll be signed out and can't sign in again until reactivated.
                  Tasks and history are preserved.
                </Dialog.Description>
              </>
            ) : (
              <>
                <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
                  Reactivate {employee.name}?
                </Dialog.Title>
                <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
                  They'll be able to sign in again with their existing password.
                </Dialog.Description>
              </>
            )}
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
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={
                  confirm === "deactivate"
                    ? { background: "linear-gradient(135deg, #E10600, #A80400)" }
                    : { background: "linear-gradient(135deg, #10B981, #059669)" }
                }
              >
                {pending
                  ? "Working…"
                  : confirm === "deactivate"
                  ? "Deactivate"
                  : "Reactivate"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
