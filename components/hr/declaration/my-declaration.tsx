"use client";

import * as React from "react";
import { Check, FileText, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDateHr } from "@/lib/format";
import { acknowledgeDeclaration, openDeclarationScan } from "@/app/(app)/hr/declaration/actions";

/**
 * THE EMPLOYEE'S OWN DECLARATION — confirm on screen, and read back the signed
 * sheet once HR has filed it.
 *
 * The confirm button is worded to make clear it does NOT replace the physical
 * signature. Half of this is a tick in a database; the half that matters is a
 * sheet of paper with their handwriting on it, and a button reading "Sign" would
 * imply they were finished when they had not started.
 */
export function MyDeclaration({
  employeeId,
  acknowledgedAt,
  hasScan,
  scanFileName,
}: {
  employeeId: string;
  acknowledgedAt: string | null;
  hasScan: boolean;
  scanFileName: string | null;
}) {
  const [busy, setBusy] = React.useState(false);
  const [confirmedAt, setConfirmedAt] = React.useState<string | null>(acknowledgedAt);

  async function confirm() {
    setBusy(true);
    try {
      const res = await acknowledgeDeclaration();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setConfirmedAt(new Date().toISOString());
      fireToast({ message: "Recorded. Please still print, sign and hand in the paper copy.", type: "success" });
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    const res = await openDeclarationScan(employeeId);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-3">
      {/* Step 1 — read and confirm in the app. */}
      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-[15px] font-bold text-ink-strong">1 · Confirm on screen</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
          Read the declaration above, then confirm that you have read it and agree to it. This is a
          record that you read it — it does <strong>not</strong> replace your signature on paper.
        </p>
        <div className="mt-3">
          {confirmedAt ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12.5px] font-bold"
              style={{ background: "color-mix(in srgb, var(--color-green) 18%, white)", color: "#166534" }}
            >
              <Check size={13} strokeWidth={3} /> Confirmed on {formatDateHr(new Date(confirmedAt))}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
              I have read and agree to this declaration
            </button>
          )}
        </div>
      </section>

      {/* Step 2 — the part that actually counts. */}
      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-[15px] font-bold text-ink-strong">2 · Print, sign and hand it in</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
          Use <strong>Download my declaration</strong> above, print it, sign it by hand and give it to HR. They
          scan it and file the original. Your signed copy appears here once they have.
        </p>
        <div className="mt-3">
          {hasScan ? (
            <button
              type="button"
              onClick={() => void open()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 text-[13px] font-bold text-ink-strong"
            >
              <FileText size={14} /> Open my signed copy
              {scanFileName ? <span className="font-medium text-ink-subtle">· {scanFileName}</span> : null}
            </button>
          ) : (
            <p className="text-[13px] font-semibold text-ink-subtle">
              No signed copy filed yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
