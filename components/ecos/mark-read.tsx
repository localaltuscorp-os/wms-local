"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { markBroadcastRead } from "@/app/(app)/hr/communications/actions";

/**
 * Fires the read-receipt exactly once, client-side, on mount.
 *
 * WHY a client effect and not a server-render write: marking read is a mutation,
 * and doing it during the server render of a page would fight Next's caching /
 * re-run semantics (a GET that writes). Instead the page renders read-only and
 * THIS component, mounted only when the viewer's receipt is still `pending`,
 * calls the `markBroadcastRead` server action once, then refreshes so the page's
 * receipt chip + author analytics reflect the new state. After the refresh the
 * server passes `active={false}` (the receipt is now `read`), so it never loops.
 */
export function MarkRead({ broadcastId, active }: { broadcastId: string; active: boolean }) {
  const router = useRouter();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (!active || fired.current) return;
    fired.current = true;
    void (async () => {
      try {
        await markBroadcastRead(broadcastId);
        router.refresh();
      } catch {
        // Best-effort — a failed receipt never blocks reading the message.
      }
    })();
  }, [active, broadcastId, router]);

  return null;
}
