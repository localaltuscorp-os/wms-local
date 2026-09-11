"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { archiveOldBroadcasts } from "@/app/(app)/hr/communications/actions";
import { fireToast } from "@/lib/toast";

/**
 * "Archive old broadcasts" — the bulk tidy-up.
 *
 * Archiving one at a time from the list is fine for a message you have just
 * finished with; it is not how anyone clears out a year of announcements. This
 * takes an age in days and retires every published broadcast older than it that
 * the caller may manage (their own, or all of them for an admin).
 *
 * Nothing is deleted: an archived broadcast keeps every read receipt and can be
 * restored from the Archived tab. The confirm still spells out the count,
 * because "older than 90 days" is a number people misjudge.
 */

const CHOICES = [30, 90, 180, 365];

export function ArchiveOldButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [days, setDays] = React.useState(90);
  const [busy, setBusy] = React.useState(false);

  const run = () => {
    if (busy) return;
    if (
      !window.confirm(
        `Archive every broadcast you sent more than ${days} days ago?\n\nThey leave the active list and stop popping up. Read receipts are kept, and you can restore them from the Archived tab.`,
      )
    ) {
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const res = await archiveOldBroadcasts(days);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({
          message:
            res.archived === 0
              ? `Nothing older than ${days} days to archive.`
              : `Archived ${res.archived} broadcast${res.archived === 1 ? "" : "s"}.`,
          type: res.archived === 0 ? "info" : "success",
        });
        setOpen(false);
        router.refresh();
      } catch {
        fireToast({ message: "Couldn't archive.", type: "error" });
      } finally {
        setBusy(false);
      }
    })();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-strong transition hover:border-hairline-strong"
      >
        <Archive size={14} strokeWidth={2.5} /> Archive old
      </button>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-2 py-1.5">
      <span className="pl-1.5 text-[12.5px] font-semibold text-ink-muted">Older than</span>
      {CHOICES.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDays(d)}
          aria-pressed={days === d}
          className={`rounded-pill px-2.5 py-1 text-[12.5px] font-bold transition ${
            days === d ? "text-white" : "text-ink-muted hover:text-ink-strong"
          }`}
          style={days === d ? { background: "linear-gradient(135deg, #E10600, #A80400)" } : undefined}
        >
          {d}d
        </button>
      ))}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1 text-[12.5px] font-bold text-ink-strong transition hover:border-hairline-strong disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} Archive
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink-strong"
      >
        Cancel
      </button>
    </div>
  );
}
