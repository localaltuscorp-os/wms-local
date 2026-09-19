"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Link2, KeyRound, UserX, UserCheck, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { fireToast } from "@/lib/toast";
import {
  deactivateEmployee,
  getInviteLink,
  reactivateEmployee,
} from "@/app/(admin)/admin/employees/actions";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import { ArchiveEmployeeDialog } from "@/components/admin/archive-employee-dialog";

/**
 * THE PER-ROW ACTION MENU for Employee Master (§15).
 *
 * ── WHY THIS IS NOT `EmployeeRowActions` ───────────────────────────────────
 * The Employees screen already has a row menu with these items, and reusing it
 * was the first thing tried. It takes an `EditableEmployee`, which carries the
 * whole edit form — including `monthlyPayAtTarget`, `weeklyTargetHours` and
 * `monthlyFee`. Employee Master deliberately strips pay from its payload unless
 * the viewer is a super-admin (see the page component), so satisfying that prop
 * would mean shipping salary figures to browsers that are not allowed to see
 * them, for every row, just to populate a menu.
 *
 * So this component reuses the PARTS that carry the behaviour — the same server
 * actions, the same `ResetPasswordDialog`, the same `ArchiveEmployeeDialog` —
 * and skips the one prop that would have leaked. Nothing here reimplements an
 * action; every item calls the function the Employees screen calls.
 *
 * ── AND "EDIT EMPLOYEE" OPENS THE WORKSPACE ────────────────────────────────
 * Not the old modal. This screen's edit surface IS the workspace — that is what
 * the whole brief is — and opening a second, different editor from inside it
 * would be exactly the duplicate employee system the brief forbids. The item
 * stays in the menu because it is in the design, and it does the obvious thing.
 *
 * ── PERMISSIONS ────────────────────────────────────────────────────────────
 * Every action re-checks on the server: `requireAdmin()` inside each, plus
 * `isSuperAdmin` for the ones that need it. What this component hides is
 * presentation only — `isSelf` stops you deactivating yourself in the UI, and
 * the server stops it regardless.
 */
export function MasterRowActions({
  employee,
  isSelf,
  canSetLegalHold,
  successorOptions,
  onEdit,
}: {
  employee: { id: string; name: string; email: string; joinedAt: Date | null; isActive: boolean };
  isSelf: boolean;
  canSetLegalHold: boolean;
  successorOptions: { value: string; label: string }[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [resetOpen, setResetOpen] = React.useState(false);
  const [offboardOpen, setOffboardOpen] = React.useState(false);

  // An employee who has never signed in has no password to reset — the link
  // they need is the original invite. Same rule, same wording, as the Employees
  // screen, so the two menus never describe the same button differently.
  const isInvited = employee.joinedAt === null;

  function copyAccessLink() {
    startTransition(async () => {
      const res = await getInviteLink(employee.id);
      if (!res.ok || !res.link) {
        fireToast({ message: res.error ?? "Could not create the link." });
        return;
      }
      try {
        await navigator.clipboard.writeText(res.link);
        fireToast({ message: `Link copied for ${employee.name}.` });
      } catch {
        // Clipboard is permission-gated and fails silently in some browsers.
        // Showing the URL beats a success toast for something that did not
        // happen.
        window.prompt("Copy this link:", res.link);
      }
    });
  }

  function setActive(next: boolean) {
    const verb = next ? "Reactivate" : "Deactivate";
    if (!window.confirm(`${verb} ${employee.name}?`)) return;
    startTransition(async () => {
      const res = next
        ? await reactivateEmployee(employee.id)
        : await deactivateEmployee(employee.id);
      fireToast({
        message: res.ok ? `${employee.name} ${next ? "reactivated" : "deactivated"}.` : (res.error ?? `Could not ${verb.toLowerCase()}.`),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${employee.name}`}
            // The row itself opens the workspace on click, so the trigger has
            // to stop the event or every menu press would also open the record
            // behind it.
            onClick={(e) => e.stopPropagation()}
            className="inline-grid size-7 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            <MoreHorizontal size={15} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil size={14} /> Edit Employee
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={copyAccessLink} disabled={pending}>
            <Link2 size={14} /> {isInvited ? "Copy invite link" : "Copy password-reset link"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setResetOpen(true)}>
            <KeyRound size={14} /> Reset Password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {employee.isActive ? (
            <DropdownMenuItem danger disabled={isSelf || pending} onClick={() => setActive(false)}>
              <UserX size={14} /> Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={pending} onClick={() => setActive(true)}>
              <UserCheck size={14} /> Reactivate
            </DropdownMenuItem>
          )}

          <DropdownMenuItem danger disabled={isSelf} onClick={() => setOffboardOpen(true)}>
            <Trash2 size={14} /> Offboard employee
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        employee={{ id: employee.id, name: employee.name }}
      />

      <ArchiveEmployeeDialog
        open={offboardOpen}
        onOpenChange={setOffboardOpen}
        employee={{
          id: employee.id,
          name: employee.name,
          email: employee.email,
          // The dialog takes a date-only string; the row carries a Date.
          joinedAt: employee.joinedAt ? employee.joinedAt.toISOString().slice(0, 10) : null,
        }}
        successorOptions={successorOptions}
        canSetLegalHold={canSetLegalHold}
      />
    </>
  );
}
