"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Send, Archive, ArchiveRestore, PauseCircle, Copy, Loader2, type LucideIcon } from "lucide-react";
import {
  resendToUnread,
  archiveBroadcast,
  unarchiveBroadcast,
  pauseBroadcast,
  duplicateBroadcast,
} from "@/app/(app)/hr/communications/actions";
import { fireToast } from "@/lib/toast";

/**
 * Author lifecycle controls on the read view's analytics panel: Duplicate,
 * Resend to unread, Pause, and Archive (or Restore, once archived).
 *
 * Each is authorised inside its server action against the broadcast's AUTHOR
 * (or a broadcast admin) — this is a thin, keyboard-accessible client wrapper
 * around them: transition spinner, toast, refresh. Archive and Pause confirm
 * first, because they change what recipients see; Duplicate and Restore do not,
 * because neither takes anything away.
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
  const [busy, setBusy] = React.useState<
    null | "resend" | "pause" | "archive" | "duplicate"
  >(null);

  const archived = status === "archived";
  const canPause = status === "published";
  const canResend = status === "published" && pendingCount > 0;

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

  const doDuplicate = () => {
    if (busy) return;
    setBusy("duplicate");
    void (async () => {
      try {
        const res = await duplicateBroadcast(broadcastId);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({ message: "Copied to a new draft.", type: "success" });
        router.push(`/communications/compose?draft=${res.id}` as Route);
      } catch {
        fireToast({ message: "Couldn't duplicate.", type: "error" });
      } finally {
        setBusy(null);
      }
    })();
  };

  const doLifecycle = (kind: "pause" | "archive") => {
    if (busy) return;
    // Restoring gives something back, so it needs no confirmation; pausing and
    // archiving take a live message away from people, so they do.
    const restoring = kind === "archive" && archived;
    if (!restoring) {
      const label =
        kind === "pause"
          ? "Pause this broadcast?"
          : "Archive this broadcast? Read receipts are kept.";
      if (!window.confirm(label)) return;
    }
    setBusy(kind);
    void (async () => {
      try {
        const res =
          kind === "pause"
            ? await pauseBroadcast(broadcastId)
            : restoring
              ? await unarchiveBroadcast(broadcastId)
              : await archiveBroadcast(broadcastId);
        if (!res.ok) {
          fireToast({ message: res.error ?? `Couldn't ${kind}.`, type: "error" });
        } else {
          fireToast({
            message: kind === "pause"
              ? "Broadcast paused."
              : restoring
                ? "Broadcast restored."
                : "Broadcast archived.",
            type: "success",
          });
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
        Icon={Copy}
        label="Duplicate"
        onClick={doDuplicate}
        loading={busy === "duplicate"}
        disabled={busy !== null}
      />
      <ActionBtn
        Icon={archived ? ArchiveRestore : Archive}
        label={archived ? "Restore" : "Archive"}
        onClick={() => doLifecycle("archive")}
        loading={busy === "archive"}
        disabled={busy !== null}
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
      className={`inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${
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
