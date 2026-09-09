"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, MessageSquareHeart } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { StarRating } from "@/components/ui/star-rating";
import { submitSessionFeedback } from "@/app/(app)/training/calendar/actions";
import type { SessionFeedbackRow } from "@/lib/queries/training-calendar";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-3 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600] resize-y";

type DimKey = "content" | "depth" | "understanding" | "applicability";
const DIMS: { key: DimKey; label: string }[] = [
  { key: "content", label: "Content" },
  { key: "depth", label: "Depth" },
  { key: "understanding", label: "Understanding" },
  { key: "applicability", label: "Applicability" },
];

export function SessionFeedbackForm({
  sessionId,
  mine,
}: {
  sessionId: string;
  mine: SessionFeedbackRow | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [ratings, setRatings] = React.useState<Record<DimKey, number | null>>({
    content: mine?.content ?? null,
    depth: mine?.depth ?? null,
    understanding: mine?.understanding ?? null,
    applicability: mine?.applicability ?? null,
  });
  const [learned, setLearned] = React.useState(mine?.learned ?? "");
  const [improve, setImprove] = React.useState(mine?.improve ?? "");

  const complete = DIMS.every((d) => ratings[d.key] != null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!complete) {
      fireToast({ message: "Rate all four dimensions.", type: "error" });
      return;
    }
    setPending(true);
    const res = await submitSessionFeedback({
      sessionId,
      content: ratings.content,
      depth: ratings.depth,
      understanding: ratings.understanding,
      applicability: ratings.applicability,
      learned: learned.trim() || null,
      improve: improve.trim() || null,
    });
    setPending(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: mine ? "Feedback updated." : "Thanks for the feedback!", type: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-md:grid-cols-1">
        {DIMS.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-bold text-ink-strong">{d.label}</span>
            <StarRating
              value={ratings[d.key]}
              onChange={(n) => setRatings((p) => ({ ...p, [d.key]: n }))}
              color={ACCENT}
              label={d.label}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">What did you learn?</label>
        <textarea className={INPUT} rows={2} maxLength={4000} value={learned} placeholder="One or two concrete takeaways…" onChange={(e) => setLearned(e.target.value)} />
      </div>
      <div>
        <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">What can be improved?</label>
        <textarea className={INPUT} rows={2} maxLength={4000} value={improve} placeholder="Honest, constructive feedback for the trainer…" onChange={(e) => setImprove(e.target.value)} />
      </div>

      <div className="flex items-center justify-end gap-3">
        {mine && <span className="text-[12.5px] font-semibold text-ink-subtle">You've already given feedback — editing it.</span>}
        <button
          type="submit"
          disabled={pending}
          className="brand-btn inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: `0 12px 30px -12px ${ACCENT}99` }}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : mine ? <Check size={16} strokeWidth={2.6} /> : <MessageSquareHeart size={16} strokeWidth={2.4} />}
          {mine ? "Update Feedback" : "Submit Feedback"}
        </button>
      </div>
    </form>
  );
}
