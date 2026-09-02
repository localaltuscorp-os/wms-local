"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, TrendingUp, X, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  acknowledgePromotion,
  actionPromotion,
  dismissPromotion,
} from "@/app/(app)/pms/signals/actions";
import { MODULE_THEME } from "@/lib/module-theme";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

type Kind = "acknowledge" | "action" | "dismiss";

/**
 * Acknowledge / Action / Dismiss buttons for one flagged promotion signal —
 * each a real wired server-action call. The decision is recorded against the
 * row (who + when); the engine never decides (Law 8).
 */
export function PromotionActions({ id, employeeName }: { id: string; employeeName: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [busy, setBusy] = React.useState<Kind | null>(null);

  function run(kind: Kind) {
    setBusy(kind);
    start(async () => {
      const res =
        kind === "acknowledge"
          ? await acknowledgePromotion({ id })
          : kind === "action"
            ? await actionPromotion({ id })
            : await dismissPromotion({ id });
      setBusy(null);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message:
          kind === "acknowledge"
            ? `Acknowledged ${employeeName}'s promotion signal.`
            : kind === "action"
              ? `Promotion actioned for ${employeeName}.`
              : `Promotion signal dismissed.`,
        type: "success",
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run("action")}
        className="wg-btn wg-sheen inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-60"
        style={{
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
          boxShadow: `0 8px 18px -10px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
      >
        {busy === "action" ? <Loader2 size={15} className="animate-spin" /> : <TrendingUp size={15} strokeWidth={2.8} />}
        Action Promotion
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run("acknowledge")}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-[13.5px] font-bold transition-colors disabled:opacity-60"
        style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
      >
        {busy === "acknowledge" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} strokeWidth={2.6} />}
        Acknowledge
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run("dismiss")}
        className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3.5 py-2 text-[13.5px] font-bold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-60"
      >
        {busy === "dismiss" ? <Loader2 size={15} className="animate-spin" /> : <X size={15} strokeWidth={2.6} />}
        Dismiss
      </button>
    </div>
  );
}
