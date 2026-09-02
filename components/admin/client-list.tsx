"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { updateClient, deleteClient } from "@/app/(admin)/admin/clients/actions";
import type { ClientWithCount } from "@/lib/queries/clients";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  clients: ClientWithCount[];
}

export function ClientList({ clients }: Props) {
  const [editing, setEditing] = useState<ClientWithCount | null>(null);
  const [deleting, setDeleting] = useState<ClientWithCount | null>(null);

  if (clients.length === 0) {
    return (
      <div
        className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No clients yet
        </p>
        <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
          Create your first one with the button above. It then shows up in the
          Client Name picker on every task.
        </p>
      </div>
    );
  }

  return (
    <>
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
              <th className="px-5 py-4 tabular-nums">Tasks</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <ClientRow
                key={c.id}
                client={c}
                rowIndex={i}
                onEdit={() => setEditing(c)}
                onDelete={() => setDeleting(c)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <EditClientDialog client={editing} onClose={() => setEditing(null)} />
      <DeleteClientDialog client={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function ClientRow({
  client,
  rowIndex,
  onEdit,
  onDelete,
}: {
  client: ClientWithCount;
  rowIndex: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = await updateClient(client.id, { isActive: !client.isActive });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: client.isActive
          ? `${client.name} deactivated.`
          : `${client.name} reactivated.`,
      });
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4 text-ink-strong font-medium">{client.name}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{client.sortOrder}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{client.taskCount}</td>
      <td className="px-5 py-4">
        {client.isActive ? (
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
              aria-label="Client actions"
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
              {client.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={onDelete}>
              <Trash2 size={15} strokeWidth={2.2} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function EditClientDialog({
  client,
  onClose,
}: {
  client: ClientWithCount | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(client?.name ?? "");
  const [sortOrder, setSortOrder] = useState<number>(client?.sortOrder ?? 100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(client?.name ?? "");
    setSortOrder(client?.sortOrder ?? 100);
    setError(null);
  }, [client?.id, client?.name, client?.sortOrder]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setError(null);

    const patch: { name?: string; sortOrder?: number } = {};
    const trimmedName = name.trim();
    if (trimmedName !== client.name) patch.name = trimmedName;
    if (sortOrder !== client.sortOrder) patch.sortOrder = sortOrder;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateClient(client.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName} updated.` });
      onClose();
    });
  }

  return (
    <Dialog.Root open={client !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit client
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Renaming updates the Client Name on every task filed under the old
            name.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Sort order
              </label>
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </div>
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

function DeleteClientDialog({
  client,
  onClose,
}: {
  client: ClientWithCount | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!client) return;
    startTransition(async () => {
      const res = await deleteClient(client.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: `${client.name} deleted.` });
      onClose();
    });
  }

  return (
    <Dialog.Root open={client !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Delete client
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Remove <strong className="text-ink-strong">“{client?.name}”</strong>{" "}
            from the Client Name picker. This can&rsquo;t be undone.
            {client && client.taskCount > 0 && (
              <>
                {" "}
                <span className="text-[#A80400] font-medium">
                  {client.taskCount} {client.taskCount === 1 ? "task is" : "tasks are"} filed
                  under this name
                </span>{" "}
                — they keep the label, it just won&rsquo;t be selectable anymore.
              </>
            )}
          </Dialog.Description>
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
              onClick={confirmDelete}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              <Trash2 size={15} strokeWidth={2.4} />
              {pending ? "Deleting…" : "Delete client"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
