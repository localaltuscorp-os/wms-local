"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Users, X } from "lucide-react";
import { reassignTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";

interface Props {
  taskId: string;
  currentDoerId: string;
  expectedUpdatedAt: string;
  employees: { id: string; name: string }[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When false the visible trigger button is omitted; open-state is
   *  driven entirely by the controlled `open` prop.  Used by the
   *  showcase right-rail action cards. */
  renderTrigger?: boolean;
}

export function ReassignDialog({
  taskId,
  currentDoerId,
  expectedUpdatedAt,
  employees,
  open: openProp,
  onOpenChange,
  renderTrigger = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const [newDoerId, setNewDoerId] = useState("");
  const [resetStatus, setResetStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newDoerId) {
      setError("Pick a new doer.");
      return;
    }
    if (newDoerId === currentDoerId) {
      setError("That's already the current doer.");
      return;
    }
    startTransition(async () => {
      const result = await reassignTask(
        taskId,
        { newDoerId, resetStatus },
        expectedUpdatedAt,
      );
      if (!result.ok) {
        if (result.error === "stale") {
          setError("Task changed by someone else. Reload first.");
        } else if (result.error === "forbidden") {
          setError("You don't have permission to reassign.");
        } else {
          setError(result.message ?? "Action failed.");
        }
        return;
      }
      fireToast({ message: "Task reassigned." });
      setOpen(false);
      setNewDoerId("");
      setResetStatus(false);
      router.refresh();
    });
  }

  // Filter the current doer out of the picker.
  const options = employees.filter((e) => e.id !== currentDoerId);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {renderTrigger && (
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[14px] font-medium border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft"
          >
            <Users size={15} strokeWidth={2.2} />
            Reassign
          </button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card p-6 shadow-xl"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-display-md text-ink-strong">
                Reassign task
              </Dialog.Title>
              <Dialog.Description className="text-[15px] text-ink-subtle mt-1.5" style={{ lineHeight: 1.5 }}>
                Pick the new doer. You can optionally reset the status to "Not Read".
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full p-1 hover:bg-surface-soft text-ink-subtle hover:text-ink-strong"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="rd-doer" className="block text-[14px] font-semibold text-ink-strong mb-1.5">
                New doer <span className="text-rose">*</span>
              </label>
              <Select
                id="rd-doer"
                value={newDoerId}
                onValueChange={setNewDoerId}
                placeholder="Select an employee…"
                searchable
                searchPlaceholder="Search employees…"
                options={options.map((e) => ({ value: e.id, label: e.name }))}
              />
            </div>

            <label className="flex items-center gap-2.5 text-[15px] text-ink-strong cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetStatus}
                onChange={(e) => setResetStatus(e.target.checked)}
                className="h-4 w-4"
              />
              Reset status to "Not Read"
            </label>

            {error && (
              <p className="text-[14px]" style={{ color: "var(--color-red-deep)" }}>{error}</p>
            )}

            <div className="flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="px-5 py-2.5 rounded-md text-[14px] font-medium border border-hairline bg-surface-soft text-ink-strong disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="px-5 py-2.5 rounded-md text-[14px] font-medium text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                }}
              >
                {pending ? "Saving…" : "Reassign"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
