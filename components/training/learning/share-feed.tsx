"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Video, Star, ExternalLink, Send } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { StarRating } from "@/components/ui/star-rating";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { rateShare } from "@/app/(app)/training/share/actions";
import type { ShareForFeedback } from "@/lib/queries/learning";
import { formatDate } from "@/lib/format";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

function weekLabel(weekStart: string): string {
  return formatDate(weekStart);
}

function ShareCard({ share, index }: { share: ShareForFeedback; index: number }) {
  const router = useRouter();
  const [rating, setRating] = React.useState<number | null>(share.myRating);
  const [comment, setComment] = React.useState(share.myComment ?? "");
  const [saving, setSaving] = React.useState(false);
  const dirty = rating !== share.myRating || comment !== (share.myComment ?? "");

  async function submit() {
    if (rating == null) return fireToast({ message: "Pick a rating 1–5 first.", type: "error" });
    setSaving(true);
    const res = await rateShare(share.id, { rating, comment });
    setSaving(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: share.myRating ? "Feedback updated." : "Feedback given.", type: "success" });
    router.refresh();
  }

  return (
    <div
      className="wg-rise border-b border-hairline bg-surface-card px-4 py-3 last:border-b-0"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="flex items-start gap-3">
        <EmployeeAvatar name={share.employeeName} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-ink-strong">{share.employeeName}</span>
            <span className="text-[12px] font-semibold text-ink-subtle">{weekLabel(share.weekStart)}</span>
          </div>
          <p className="mt-0.5 text-[14px] font-semibold text-ink-strong" style={{ lineHeight: 1.35 }}>{share.topic}</p>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-[12px] font-semibold text-ink-subtle">
            <span className="tabular-nums">{share.minutes} min</span>
            {share.videoUrl && (
              <a href={share.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: ACCENT_DEEP }}>
                <Video size={13} /> Watch <ExternalLink size={11} />
              </a>
            )}
            {share.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1" style={{ color: "#15803d" }}>
                <Star size={13} fill="#16a34a" stroke="#16a34a" /> {share.avgRating?.toFixed(1)} · {share.ratingCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {share.notes && (
        <p className="mt-2 rounded-lg bg-surface-soft px-3 py-2 text-[12.5px] font-medium text-ink-muted" style={{ lineHeight: 1.4 }}>
          {share.notes}
        </p>
      )}

      <div className="mt-3 border-t border-hairline pt-3">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft">
          {share.myRating ? "Your feedback" : "Rate this Share"}
        </p>
        <StarRating value={rating} onChange={setRating} color={ACCENT} label="Rate this Share 1 to 5" />
        <textarea
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          placeholder="A line of feedback (optional)"
          className="mt-2 w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle resize-y min-h-[42px]"
          onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
          onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={saving || !dirty || rating == null}
            className="brand-btn inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />}
            {share.myRating ? "Update" : "Give Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareFeed({ shares }: { shares: ShareForFeedback[] }) {
  if (shares.length === 0) {
    return (
      <div className="rounded-xl border border-solid border-hairline-strong bg-surface-card px-4 py-5 text-center">
        <p className="text-[14px] font-bold text-ink-strong">No colleague shares yet.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
      {shares.map((s, i) => (
        <ShareCard key={s.id} share={s} index={i} />
      ))}
    </div>
  );
}
