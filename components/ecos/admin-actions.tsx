"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Archive, PauseCircle, Loader2, type LucideIcon } from "lucide-react";
import {
  resendToUnread,
  archiveBroadcast,
  pauseBroadcast,
} from "@/app/(app)/hr/communications/actions";
import { fireToast } from "@/lib/toast";

/**
 * Author lifecycle controls on the read view's analytics panel: Resend to
 * unread, Pause, Archive. Each is HR-gated inside its server action; this is a
 * thin, keyboard-accessible client wrapper (transition spinner + toast +
 * refresh). Archive/Pause confirm first — they change what recipients see.
 */
export function AdminActions({
  broadcastId,
  status,
  pendingCount,
}: {
  broadcastId: string;
  status: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | "resend" | "pause" | "archive">(null);

  const canPause = status === "published";
  const canResend = status === "published" && pendingCount > 0;
  const canArchive = status !== "archived";

  const doResend = () => {
    if (busy) return;
    setBusy("resend");
    void (async () => {
      try {
        const res = await resendToUnread(broadcastId);
        if (!res.ok) {
          fireToast({ message: res.error ?? "Couldn't resend.", type: "error" });
        } else if (res.resent === 0) {
          fireToast({ message: "No unread recipients to resend to.", type: "info" });
        } else {
          fireToast({ message: `Re-sent to ${res.resent} unread recipient${res.resent === 1 ? "" : "s"}.`, type: "success" });
        }
        router.refresh();
      } catch {
        fireToast({ message: "Couldn't resend.", type: "error" });
      } finally {
        setBusy(null);
      }
    })();
  };

  const doLifecycle = (kind: "pause" | "archive") => {
    if (busy) return;
    const label = kind === "pause" ? "Pause this broadcast?" : "Archive this broadcast?";
    if (!window.confirm(label)) return;
    setBusy(kind);
    void (async () => {
      try {
        const res = kind === "pause" ? await pauseBroadcast(broadcastId) : await archiveBroadcast(broadcastId);
        if (!res.ok) {
          fireToast({ message: res.error ?? `Couldn't ${kind}.`, type: "error" });
        } else {
          fireToast({ message: kind === "pause" ? "Broadcast paused." : "Broadcast archived.", type: "success" });
        }
        router.refresh();
      } catch {
        fireToast({ message: `Couldn't ${kind}.`, type: "error" });
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <ActionBtn
        Icon={Send}
        label={`Resend to unread${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
        onClick={doResend}
        loading={busy === "resend"}
        disabled={!canResend || busy !== null}
        primary
      />
      <ActionBtn
        Icon={PauseCircle}
        label="Pause"
        onClick={() => doLifecycle("pause")}
        loading={busy === "pause"}
        disabled={!canPause || busy !== null}
      />
      <ActionBtn
        Icon={Archive}
        label="Archive"
        onClick={() => doLifecycle("archive")}
        loading={busy === "archive"}
        disabled={!canArchive || busy !== null}
      />
    </div>
  );
}

function ActionBtn({
  Icon,
  label,
  onClick,
  loading,
  disabled,
  primary = false,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${
        primary ? "text-white" : "text-ink-strong"
      }`}
      style={
        primary
          ? { background: "linear-gradient(135deg, #E10600, #A80400)", boxShadow: "0 10px 22px -12px rgba(168,4,0,0.55)" }
          : { background: "#ffffff", border: "1px solid var(--color-hairline, #e2e8f0)", boxShadow: "0 1px 2px rgba(15,23,42,0.05)" }
      }
    >
      {loading ? <Loader2 size={14} strokeWidth={2.6} className="animate-spin" /> : <Icon size={14} strokeWidth={2.4} />}
      {label}
    </button>
  );
}
