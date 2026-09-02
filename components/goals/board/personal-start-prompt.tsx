"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";
import { copyProfessionalToPersonal } from "@/app/(app)/goals/cascade/actions";
import { fireToast } from "@/lib/toast";

/**
 * First-run prompt shown when an admin's PERSONAL space is empty: offer to seed
 * it from their Professional goal tree (progress reset). Dismissable.
 */
export function PersonalStartPrompt() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  function start() {
    setBusy(true);
    void copyProfessionalToPersonal()
      .then((res) => {
        setBusy(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: `Copied ${res.created} goal${res.created === 1 ? "" : "s"} into Personal`, type: "success" });
        router.refresh();
      })
      .catch(() => {
        setBusy(false);
        fireToast({ message: "Couldn't copy. Try again.", type: "error" });
      });
  }

  return (
    <div
      className="wg-rise relative mb-5 flex flex-wrap items-center gap-4 rounded-2xl border p-5"
      style={{
        background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card)), var(--color-surface-card) 72%)",
        borderColor: "color-mix(in srgb, var(--color-altus-red) 34%, transparent)",
        boxShadow: "0 10px 30px -18px color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
      }}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
        <Sparkles size={22} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display)" }}>
          Start your Personal space from your Professional goals?
        </h3>
        <p className="mt-0.5 text-[13.5px] font-medium text-ink-muted">
          Copies your Yearly → Monthly goal tree into Personal — progress reset, yours to edit privately. Or just add your own below.
        </p>
      </div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={2.6} />}
        Copy from Professional
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-black/[0.05] hover:text-ink-strong"
      >
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
