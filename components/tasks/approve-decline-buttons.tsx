"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { approveTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  taskId: string;
  expectedUpdatedAt: string;
  declineOpen?: boolean;
  onDeclineOpenChange?: (open: boolean) => void;
}

export function ApproveDeclineButtons({
  taskId,
  expectedUpdatedAt,
  declineOpen,
  onDeclineOpenChange,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [internalOpen, setInternalOpen] = useState(false);
  const openDecline = declineOpen ?? internalOpen;
  const setOpenDecline = (next: boolean) => {
    if (onDeclineOpenChange) onDeclineOpenChange(next);
    else setInternalOpen(next);
  };
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(decision: "approved" | "not_approved") {
    setError(null);
    startTransition(async () => {
      const result = await approveTask(
        taskId,
        { decision, note: note || undefined },
        expectedUpdatedAt,
      );
      if (!result.ok) {
        if (result.error === "stale") {
          setError("Task changed by someone else. Reload to see the latest.");
        } else if (result.error === "forbidden") {
          setError("You don't have permission to approve this task.");
        } else {
          setError(result.message ?? "Action failed.");
        }
        return;
      }
      fireToast({
        message: decision === "approved" ? "Approved." : "Declined.",
      });
      setOpenDecline(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => submit("approved")}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[14px] font-medium text-white disabled:opacity-50"
        style={{
          background:
            "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
          boxShadow: "0 2px 8px color-mix(in srgb, var(--color-green) 35%, transparent)",
        }}
      >
        <Check size={15} strokeWidth={2.4} />
        Approve
      </button>

      <Dialog.Root open={openDecline} onOpenChange={setOpenDecline}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[14px] font-medium border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft disabled:opacity-50"
          >
            <X size={15} strokeWidth={2.4} />
            Decline
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[70] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card p-6 shadow-xl"
          >
            <Dialog.Title className="text-display-md text-ink-strong">
              Decline task
            </Dialog.Title>
            <Dialog.Description className="text-[15px] text-ink-subtle mt-1.5" style={{ lineHeight: 1.5 }}>
              Add an optional note for the doer.
            </Dialog.Description>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-4 w-full rounded-md border border-hairline px-3.5 py-3 text-[15px] bg-white resize-y"
              placeholder="Why is this being declined? (optional)"
            />
            {error && (
              <p className="text-[14px] mt-2" style={{ color: "var(--color-red-deep)" }}>
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 mt-4">
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
                type="button"
                disabled={pending}
                onClick={() => submit("not_approved")}
                className="px-5 py-2.5 rounded-md text-[14px] font-medium text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-red), var(--color-red-deep))",
                }}
              >
                {pending ? "Saving…" : "Decline"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {error && !openDecline && (
        <p className="text-[14px]" style={{ color: "var(--color-red-deep)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
