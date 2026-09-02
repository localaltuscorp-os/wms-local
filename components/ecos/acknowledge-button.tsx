"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { acknowledgeBroadcast } from "@/app/(app)/hr/communications/actions";
import { fireToast } from "@/lib/toast";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The recipient's explicit "I Acknowledge" action (ackMode === "acknowledge").
 * Calls the server action, toasts the outcome and refreshes so the receipt chip
 * flips to Acknowledged. Keyboard-accessible; disabled + spinner while pending.
 */
export function AcknowledgeButton({ broadcastId }: { broadcastId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = () => {
    if (pending) return;
    startTransition(async () => {
      try {
        const res = await acknowledgeBroadcast(broadcastId);
        if (!res.ok) {
          fireToast({ message: res.error ?? "Couldn't record your acknowledgement.", type: "error" });
          return;
        }
        fireToast({ message: "Acknowledged — thank you.", type: "success" });
        router.refresh();
      } catch {
        fireToast({ message: "Couldn't record your acknowledgement.", type: "error" });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-70"
      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
    >
      {pending ? (
        <Loader2 size={16} strokeWidth={2.6} className="animate-spin" />
      ) : (
        <CheckCircle2 size={16} strokeWidth={2.5} />
      )}
      {pending ? "Recording…" : "I Acknowledge"}
    </button>
  );
}
