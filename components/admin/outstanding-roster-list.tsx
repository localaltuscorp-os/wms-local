"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MoreHorizontal, Pencil, Power } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type {
  ActionResult,
  CreateRosterInput,
  UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

export interface RosterItem {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
}

type CreateAction = (
  input: CreateRosterInput,
) => Promise<ActionResult<{ id: string }>>;
type UpdateAction = (
  id: string,
  fields: UpdateRosterInput,
) => Promise<ActionResult>;

interface Props {
  title: string;
  items: RosterItem[];
  createAction: CreateAction;
  updateAction: UpdateAction;
  /** Singular noun for the usage column, e.g. "contracts". */
  usageLabel: string;
}

/**
 * Shared admin roster manager for the three Outstanding lookup lists
 * (products / entities / payment modes). Mirrors the Clients admin list UX:
 * a create dialog, a table with inline rename + activate/deactivate, and a
 * usage-count column. There's no delete — the roster actions intentionally
 * only support create + update (rows are referenced by contracts via
 * ON DELETE SET NULL, so deactivation is the safe "remove from picker" path).
 */
export function OutstandingRosterList({
  title,
  items,
  createAction,
  updateAction,
  usageLabel,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<RosterItem | null>(null);

  const noun = title.replace(/s$/, "").toLowerCase();

  if (items.length === 0) {
    return (
      <>
        <div className="mb-6">
          <CreateRosterDialog
            title={title}
            createAction={createAction}
            onDone={() => router.refresh()}
          />
        </div>
        <div
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-serif text-ink-strong"
            style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
          >
            No {title.toLowerCase()} yet
          </p>
          <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
            Create your first one with the button above. It then shows up in the
            contract form picker.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <CreateRosterDialog
          title={title}
          createAction={createAction}
          onDone={() => router.refresh()}
        />
      </div>
      <div
        className="overflow-hidden rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <table className="w-full text-[15px]">
          <thead>
            <tr
              className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <th className="px-5 py-4">Name</th>
              <th className="px-5 py-4 tabular-nums">Sort</th>
              <th className="px-5 py-4 tabular-nums">Usage</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <RosterRow
                key={item.id}
                item={item}
                rowIndex={i}
                usageLabel={usageLabel}
                updateAction={updateAction}
                onEdit={() => setEditing(item)}
                onDone={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>
      <EditRosterDialog
        noun={noun}
        item={editing}
        updateAction={updateAction}
        onClose={() => setEditing(null)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function RosterRow({
  item,
  rowIndex,
  usageLabel,
  updateAction,
  onEdit,
  onDone,
}: {
  item: RosterItem;
  rowIndex: number;
  usageLabel: string;
  updateAction: UpdateAction;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = await updateAction(item.id, { isActive: !item.isActive });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: item.isActive
          ? `${item.name} deactivated.`
          : `${item.name} reactivated.`,
      });
      onDone();
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4 text-ink-strong font-medium">{item.name}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{item.sortOrder}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">
        {item.usageCount} {usageLabel}
      </td>
      <td className="px-5 py-4">
        {item.isActive ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-green)" }} />
            Active
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-ink-subtle)" }} />
            Inactive
          </span>
        )}
      </td>
      <td className="px-5 py-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Actions"
              disabled={pending}
              className="inline-flex items-center justify-center size-9 rounded-lg border border-hairline text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors disabled:opacity-50 data-[state=open]:border-altus-red data-[state=open]:text-altus-red"
            >
              <MoreHorizontal size={18} strokeWidth={2.2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil size={15} strokeWidth={2.2} />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleActive();
              }}
            >
              <Power size={15} strokeWidth={2.2} />
              {item.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function CreateRosterDialog({
  title,
  createAction,
  onDone,
}: {
  title: string;
  createAction: CreateAction;
  onDone: () => void;
}) {
  const noun = title.replace(/s$/, "").toLowerCase();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setSortOrder(100);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAction({ name: name.trim(), sortOrder });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${name.trim()} created.` });
      reset();
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          + New {noun}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New {noun}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            This appears in the picker when anyone creates or edits an
            outstanding contract.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <RosterField label="Name">
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </RosterField>
            <RosterField
              label="Sort order"
              hint="Lower numbers appear first in the picker when names tie. Default 100."
            >
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </RosterField>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
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
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditRosterDialog({
  noun,
  item,
  updateAction,
  onClose,
  onDone,
}: {
  noun: string;
  item: RosterItem | null;
  updateAction: UpdateAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [sortOrder, setSortOrder] = useState<number>(item?.sortOrder ?? 100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(item?.name ?? "");
    setSortOrder(item?.sortOrder ?? 100);
    setError(null);
  }, [item?.id, item?.name, item?.sortOrder]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError(null);

    const patch: { name?: string; sortOrder?: number } = {};
    const trimmedName = name.trim();
    if (trimmedName !== item.name) patch.name = trimmedName;
    if (sortOrder !== item.sortOrder) patch.sortOrder = sortOrder;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateAction(item.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName} updated.` });
      onClose();
      onDone();
    });
  }

  return (
    <Dialog.Root open={item !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit {noun}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Renaming updates the picker everywhere this {noun} is offered.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <RosterField label="Name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </RosterField>
            <RosterField label="Sort order">
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </RosterField>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
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
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RosterField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-[#94A3B8]">{hint}</p>}
    </div>
  );
}
