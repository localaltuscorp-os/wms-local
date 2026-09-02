"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { addHoliday, updateHoliday, removeHoliday } from "@/app/(admin)/admin/holidays/actions";

export interface HolidayItem {
  id: string;
  holidayDate: string;
  label: string;
  isActive: boolean;
}

/** "12 Aug 2026" from a YYYY-MM-DD string (no timezone drift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[(m ?? 1) - 1]} ${y}`;
}

export function HolidayList({
  items,
  year,
}: {
  items: HolidayItem[];
  year: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<HolidayItem | null>(null);

  return (
    <>
      <div className="mb-6 flex justify-end">
        <CreateHolidayDialog year={year} onDone={() => router.refresh()} />
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-serif text-ink-strong"
            style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
          >
            No holidays for {year}
          </p>
          <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
            Add the first one with the button above. Active holidays are marked
            off on the attendance calendar.
          </p>
        </div>
      ) : (
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
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Label</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <HolidayRow
                  key={item.id}
                  item={item}
                  rowIndex={i}
                  onEdit={() => setEditing(item)}
                  onDone={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditHolidayDialog
          item={editing}
          onClose={() => setEditing(null)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  );
}

function HolidayRow({
  item,
  rowIndex,
  onEdit,
  onDone,
}: {
  item: HolidayItem;
  rowIndex: number;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = await updateHoliday({ id: item.id, isActive: !item.isActive });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: item.isActive
          ? `${item.label} deactivated.`
          : `${item.label} reactivated.`,
      });
      onDone();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeHoliday({ id: item.id });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: `${item.label} removed.` });
      onDone();
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4 text-ink-strong font-medium tabular-nums whitespace-nowrap">
        {prettyDate(item.holidayDate)}
      </td>
      <td className="px-5 py-4 text-ink-soft">{item.label}</td>
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
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                remove();
              }}
            >
              <Trash2 size={15} strokeWidth={2.2} />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function CreateHolidayDialog({
  year,
  onDone,
}: {
  year: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState(`${year}-01-01`);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setHolidayDate(`${year}-01-01`);
    setLabel("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addHoliday({ holidayDate, label: label.trim() });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${label.trim()} added.` });
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
          + New holiday
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New holiday
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            Active holidays are marked off on the attendance calendar.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <HolidayField label="Date">
              <input
                required
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </HolidayField>
            <HolidayField label="Label">
              <input
                required
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder="e.g. Independence Day"
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </HolidayField>
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
                {pending ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditHolidayDialog({
  item,
  onClose,
  onDone,
}: {
  item: HolidayItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = label.trim();
    if (trimmed === item.label) {
      setError("No changes to save.");
      return;
    }
    startTransition(async () => {
      const res = await updateHoliday({ id: item.id, label: trimmed });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmed} updated.` });
      onClose();
      onDone();
    });
  }

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit holiday
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            {prettyDate(item.holidayDate)}
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <HolidayField label="Label">
              <input
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </HolidayField>
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

function HolidayField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
