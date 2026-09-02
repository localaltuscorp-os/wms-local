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
      // TYPOGRAPHY FIX. This carried `nav-pill text-body`, and neither did what
      // it looked like it did:
      //   · `.nav-pill` is only ever defined as `.header-light .nav-pill`, and
      //     /inbox is not inside a `.header-light` scope — so it contributed
      //     nothing at all: no padding, no radius, no weight.
      //   · `.text-body` is 18px/500, which is the BODY-COPY size. That left the
      //     button's label a third larger than every other control on the page
      //     and unpadded, so it read as stray text rather than a button.
      // It now uses the same 12.5px bold pill as the Raise-a-Ticket / Clear
      // buttons in the row below it. `brand-btn` is dropped too: it forces the
      // module accent with `!important`, which fought the neutral inline
      // background this button has always set.
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-[rgba(15,23,42,0.10)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: "rgba(15, 23, 42, 0.06)",
        color: "var(--color-ink-strong)",
      }}
    >
      {isPending ? "Marking…" : "Mark All Read"}
    </button>
  );
}
