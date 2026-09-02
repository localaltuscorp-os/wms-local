"use client";

import { useTransition } from "react";
import { markAllNotificationsRead } from "./actions";
import { fireToast } from "@/lib/toast";

interface Props {
  hasUnread: boolean;
}

/**
 * "Mark all read" button at the top of /inbox.  Disabled when there's
 * nothing to mark.  Pure progressive enhancement — the server action
 * does its own auth + scope checks.
 */
export function MarkAllButton({ hasUnread }: Props) {
  const [isPending, startTransition] = useTransition();
  const disabled = !hasUnread || isPending;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        startTransition(async () => {
          const res = await markAllNotificationsRead();
          if (!res.ok) fireToast({ message: res.error });
        });
      }}
      className="nav-pill text-body disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: "rgba(15, 23, 42, 0.06)",
        color: "var(--color-ink-strong)",
      }}
    >
      {isPending ? "Marking…" : "Mark all read"}
    </button>
  );
}
