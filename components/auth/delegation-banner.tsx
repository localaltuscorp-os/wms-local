"use client";

import { useTransition } from "react";
import { ShieldAlert } from "lucide-react";
import { endTemporaryAccess } from "@/app/(admin)/admin/temporary-access/actions";

/**
 * "YOU ARE ACTING AS …" — the banner a delegated session always shows.
 *
 * ── WHY THIS IS NOT OPTIONAL CHROME ────────────────────────────────────────
 * Impersonation without a visible indicator is the same screen as a normal
 * session, and everything typed into it is attributed to the account being
 * borrowed. A delegate who forgets which account they are in will write real
 * data as somebody else — file a leave request, approve a task, submit a form —
 * and there is nothing in the interface to stop them or even to prompt the
 * thought. So this is fixed, unconditional, and cannot be dismissed: the only
 * way to make it go away is to end the session, which is the button on it.
 *
 * It renders NOTHING when there is no delegation, so the ordinary case is
 * unaffected.
 */
export function DelegationBanner({
  targetName,
  delegateName,
  expiresAtIso,
}: {
  targetName: string;
  delegateName: string;
  expiresAtIso: string;
}) {
  const [pending, startTransition] = useTransition();

  function end() {
    startTransition(async () => {
      await endTemporaryAccess();
      // A hard navigation, not a soft refresh: every cached segment on screen
      // was rendered for the borrowed identity, and going back to being
      // yourself has to re-render all of them from the server.
      window.location.assign("/hub");
    });
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-[13px] font-medium text-white"
      style={{ background: "linear-gradient(135deg, #B45309, #92400E)" }}
    >
      <ShieldAlert size={15} strokeWidth={2.4} className="shrink-0" />
      <span>
        <strong>{delegateName}</strong>, you are acting as{" "}
        <strong>{targetName}</strong> — anything you do is recorded against that
        account.
      </span>
      <span className="opacity-80">
        Ends {new Date(expiresAtIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button
        type="button"
        onClick={end}
        disabled={pending}
        className="rounded-pill bg-white/20 px-3 py-1 text-[12.5px] font-semibold hover:bg-white/30 disabled:opacity-60"
      >
        {pending ? "Ending…" : "End session"}
      </button>
    </div>
  );
}
