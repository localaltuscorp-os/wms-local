"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Heart } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { submitCsat } from "@/lib/hr/csat-actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/**
 * CSAT on resolve — shown to the REQUESTER once their ticket is resolved/closed.
 * Once rated, it collapses to a thank-you. The rating is 1–5 with an optional
 * comment; the score never appears in the metrics drill-down for grievances.
 */
export function CsatCard({
  ticketId,
  existingScore,
  existingComment,
}: {
  ticketId: string;
  existingScore: number | null;
  existingComment: string | null;
}) {
  const router = useRouter();
  const [score, setScore] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (existingScore) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-card p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
          <Heart size={15} style={{ color: RED }} /> Thanks for rating this — {existingScore}/5.
        </div>
        {existingComment && <p className="mt-1.5 text-[13px] text-ink-muted">“{existingComment}”</p>}
      </div>
    );
  }

  async function submit() {
    if (busy) return;
    if (score < 1) {
      fireToast({ message: "Pick a rating from 1 to 5.", type: "error" });
      return;
    }
    setBusy(true);
    const res = await submitCsat({ ticketId, score, comment: comment.trim() || undefined });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Thanks for your feedback!", type: "success" });
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-5">
      <h3 className="text-[14.5px] font-bold text-ink-strong">How was the help you got?</h3>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">Your rating helps the HR desk improve.</p>
      <div className="mt-3 flex items-center gap-1.5" role="radiogroup" aria-label="Rate 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hover || score) >= n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setScore(n)}
              className="rounded-md p-0.5 transition-transform hover:scale-110"
            >
              <Star size={26} strokeWidth={2} style={{ color: active ? RED : "var(--color-ink-soft, #94a3b8)", fill: active ? RED : "transparent" }} />
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Anything you'd like to add? (optional)"
        className="mt-3 w-full resize-y rounded-xl border border-hairline bg-transparent px-3.5 py-2.5 text-[13.5px] text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
      />
      <div className="mt-2.5 flex justify-end">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} Submit rating
        </button>
      </div>
    </div>
  );
}
