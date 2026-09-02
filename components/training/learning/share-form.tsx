"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Video, Star } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveShare } from "@/app/(app)/training/share/actions";
import type { ThisWeekShare } from "@/lib/queries/learning";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const SHARE_MIN = 10;

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle";
const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

export function ShareForm({
  existing,
  weekLabel,
}: {
  existing: ThisWeekShare | null;
  weekLabel: string;
}) {
  const router = useRouter();
  const firstRef = React.useRef<HTMLInputElement>(null);
  const [topic, setTopic] = React.useState(existing?.topic ?? "");
  const [minutes, setMinutes] = React.useState(String(existing?.minutes ?? SHARE_MIN));
  const [videoUrl, setVideoUrl] = React.useState(existing?.videoUrl ?? "");
  const [notes, setNotes] = React.useState(existing?.notes ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    firstRef.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!topic.trim()) return setError("Add a topic for your Share.");
    setSubmitting(true);
    const res = await saveShare({ topic, minutes, videoUrl, notes });
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    fireToast({ message: existing ? "Share updated." : "Weekly Share logged.", type: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Status banner */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={
          existing
            ? { background: "color-mix(in srgb, #16a34a 10%, transparent)", border: "1px solid color-mix(in srgb, #16a34a 36%, transparent)" }
            : { background: "color-mix(in srgb, #E10600 8%, transparent)", border: "1px solid color-mix(in srgb, #E10600 34%, transparent)" }
        }
      >
        {existing ? (
          <CheckCircle2 size={20} strokeWidth={2.4} style={{ color: "#15803d" }} />
        ) : (
          <Video size={20} strokeWidth={2.2} style={{ color: ACCENT_DEEP }} />
        )}
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold" style={{ color: existing ? "#15803d" : ACCENT_DEEP }}>
            {existing ? "Done — this week's Share is logged" : "You haven't done this week's Share yet"}
          </p>
          <p className="text-[12.5px] font-medium text-ink-muted">{weekLabel} · {SHARE_MIN} min compulsory</p>
        </div>
        {existing && existing.ratingCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-bold tabular-nums" style={{ color: "#15803d" }}>
            <Star size={14} fill="#16a34a" stroke="#16a34a" /> {existing.avgRating?.toFixed(1)} · {existing.ratingCount}
          </span>
        )}
      </div>

      <div>
        <label className={LABEL}>Topic — what are you sharing?</label>
        <input
          ref={firstRef}
          className={FIELD}
          value={topic}
          maxLength={200}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. A faster way to close the monthly books"
          onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
          onBlur={(e) => (e.currentTarget.style.borderColor = "")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <label className={LABEL}>Minutes</label>
          <input
            type="number"
            inputMode="numeric"
            min={SHARE_MIN}
            max={180}
            className={FIELD}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
          <p className="mt-1 text-[12.5px] font-medium text-ink-subtle">Minimum {SHARE_MIN} minutes.</p>
        </div>
        <div>
          <label className={LABEL}>Video Link</label>
          <input
            type="url"
            inputMode="url"
            className={FIELD}
            value={videoUrl}
            maxLength={2000}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://… (Drive, Loom, YouTube)"
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>Notes (optional)</label>
        <textarea
          className={FIELD + " min-h-[72px] resize-y"}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What colleagues should take away"
          onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
          onBlur={(e) => (e.currentTarget.style.borderColor = "")}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg px-4 py-3 text-[14px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <button
          type="submit"
          disabled={submitting}
          className="brand-btn inline-flex items-center gap-2 rounded-xl py-3 px-7 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}
        >
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <Video size={17} strokeWidth={2.4} />}
          {existing ? "Update Share" : "Log This Week's Share"}
        </button>
      </div>
    </form>
  );
}
