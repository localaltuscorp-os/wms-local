"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { updateSubject } from "@/app/(admin)/admin/subjects/actions";
import type { SubjectWithCount } from "@/lib/queries/subjects";

interface Props {
  subjects: SubjectWithCount[];
}

export function SubjectList({ subjects }: Props) {
  const [editing, setEditing] = useState<SubjectWithCount | null>(null);

  if (subjects.length === 0) {
    return (
      <div
        className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No subjects yet
        </p>
        <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
          Create your first one with the button above. It then shows up in the
          Subject picker on every task.
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
            {subjects.map((s, i) => (
              <SubjectRow
                key={s.id}
                subject={s}
                rowIndex={i}
                onEdit={() => setEditing(s)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <EditSubjectDialog subject={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SubjectRow({
  subject,
  rowIndex,
  onEdit,
}: {
  subject: SubjectWithCount;
  rowIndex: number;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = await updateSubject(subject.id, { isActive: !subject.isActive });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: subject.isActive
          ? `${subject.name} deactivated.`
          : `${subject.name} reactivated.`,
      });
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4 text-ink-strong font-medium">{subject.name}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{subject.sortOrder}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{subject.taskCount}</td>
      <td className="px-5 py-4">
        {subject.isActive ? (
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
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={toggleActive}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong transition-colors disabled:opacity-50"
          >
            {subject.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditSubjectDialog({
  subject,
  onClose,
}: {
  subject: SubjectWithCount | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(subject?.name ?? "");
  const [sortOrder, setSortOrder] = useState<number>(subject?.sortOrder ?? 100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(subject?.name ?? "");
    setSortOrder(subject?.sortOrder ?? 100);
    setError(null);
  }, [subject?.id, subject?.name, subject?.sortOrder]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject) return;
    setError(null);

    const patch: { name?: string; sortOrder?: number } = {};
    const trimmedName = name.trim();
    if (trimmedName !== subject.name) patch.name = trimmedName;
    if (sortOrder !== subject.sortOrder) patch.sortOrder = sortOrder;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateSubject(subject.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName} updated.` });
      onClose();
    });
  }

  return (
    <Dialog.Root open={subject !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit subject
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Renaming updates the Subject on every task filed under the old name.
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
                maxLength={80}
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
