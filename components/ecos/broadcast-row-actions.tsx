"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Copy, Archive, ArchiveRestore, Loader2, type LucideIcon } from "lucide-react";
import {
  duplicateBroadcast,
  archiveBroadcast,
  unarchiveBroadcast,
} from "@/app/(app)/hr/communications/actions";
import { fireToast } from "@/lib/toast";

/**
 * Per-row controls on the Sent / Archived lists: Duplicate, and Archive (or
 * Restore, on an archived row).
 *
 * DUPLICATE is the one that earns its place here rather than on the detail
 * page: the reason to copy a broadcast is almost always "send that again with
 * one line changed", and that thought happens while looking at the list. It
 * lands you straight in the composer on the new draft.
 *
 * Every action is authorised server-side against the broadcast's author; this
 * only hides the buttons for rows the viewer cannot act on (an admin looking at
 * someone else's send), so nobody clicks their way into a refusal.
 */
export function BroadcastRowActions({
  broadcastId,
  status,
  title,
  canManage,
}: {
  broadcastId: string;
  status: string;
  title: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | "duplicate" | "archive">(null);
  const archived = status === "archived";

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
        fireToast({ message: "Couldn't duplicate that broadcast.", type: "error" });
      } finally {
        setBusy(null);
      }
    })();
  };

  const doArchive = () => {
    if (busy) return;
    // Archiving changes what recipients see, so it asks first. Restoring does
    // not — it only puts something back.
    if (!archived && !window.confirm(`Archive "${title}"? Read receipts are kept.`)) return;
    setBusy("archive");
    void (async () => {
      try {
        const res = archived
          ? await unarchiveBroadcast(broadcastId)
          : await archiveBroadcast(broadcastId);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({ message: archived ? "Restored." : "Archived.", type: "success" });
        router.refresh();
      } catch {
        fireToast({ message: "Couldn't update that broadcast.", type: "error" });
      } finally {
        setBusy(null);
      }
    })();
  };

  if (!canManage) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <IconBtn
        Icon={Copy}
        label="Duplicate"
        onClick={doDuplicate}
        loading={busy === "duplicate"}
        disabled={busy !== null}
      />
      <IconBtn
        Icon={archived ? ArchiveRestore : Archive}
        label={archived ? "Restore" : "Archive"}
        onClick={doArchive}
        loading={busy === "archive"}
        disabled={busy !== null}
      />
    </div>
  );
}

function IconBtn({
  Icon,
  label,
  onClick,
  loading,
  disabled,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-xl border border-hairline bg-white text-ink-soft transition enabled:hover:border-hairline-strong enabled:hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-45"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} strokeWidth={2.3} />}
    </button>
  );
}
