"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2, Users } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE } from "@/lib/billing/ui";
import { restoreFromBinAction } from "@/app/(app)/billing/customers/actions";

/**
 * One row in the recycle bin, with its Restore button.
 *
 * `deletedAt` arrives as an ISO STRING rather than a Date: this is a client
 * component, and a Date crossing that boundary is serialised and revived, which
 * is fine but means the page and the browser can disagree about the local
 * rendering of it. Formatting from the string here keeps one answer.
 */
export function RecycleBinRow({
  row,
}: {
  row: { id: string; kind: "customer" | "option"; title: string; detail: string; deletedAt: string; deletedByName: string | null };
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function restore() {
    setBusy(true);
    try {
      const r = await restoreFromBinAction({ id: row.id, kind: row.kind });
      if (!r.ok) {
        fireToast({ message: r.error, type: "error" });
        return;
      }
      fireToast({ message: `“${row.title}” restored.`, type: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[16px] p-3.5" style={CARD_STYLE}>
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-chip"
        style={{ background: "rgba(15,23,42,0.05)" }}
      >
        {row.kind === "customer" ? (
          <Users size={15} className="text-ink-muted" />
        ) : (
          <Trash2 size={15} className="text-ink-muted" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold text-ink-strong">{row.title}</div>
        <div className="truncate text-[12px] text-ink-muted">
          {row.detail} · removed {row.deletedAt.slice(0, 10)}
          {row.deletedByName ? ` by ${row.deletedByName}` : ""}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void restore()}
        disabled={busy}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-chip px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore
      </button>
    </li>
  );
}
