"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Video, PlaySquare, Sparkles, Loader2, Plus, Trash2, BookText, ExternalLink } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { logSelfLearning, deleteSelfLearning } from "@/app/(app)/training/self-learning/actions";
import { formatDate } from "@/lib/format";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle";
const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

type Kind = "book" | "video" | "youtube" | "other";
const KINDS: { id: Kind; label: string; Icon: LucideIcon }[] = [
  { id: "book", label: "Book", Icon: BookOpen },
  { id: "video", label: "Video", Icon: Video },
  { id: "youtube", label: "YouTube", Icon: PlaySquare },
  { id: "other", label: "Other", Icon: Sparkles },
];

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function SelfLearningForm() {
  const router = useRouter();
  const firstRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState<Kind>("book");
  const [title, setTitle] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [minutes, setMinutes] = React.useState("30");
  const [evidenceUrl, setEvidenceUrl] = React.useState("");
  const [learnDate, setLearnDate] = React.useState(todayIst());
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    firstRef.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Add a title.");
    if (!evidenceUrl.trim()) return setError("Evidence is required — paste a link.");
    setSubmitting(true);
    const res = await logSelfLearning({
      kind,
      title,
      sourceUrl,
      minutes,
      evidenceUrl,
      notes,
      learnDate,
    });
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    fireToast({ message: "Self-learning logged.", type: "success" });
    setTitle("");
    setSourceUrl("");
    setMinutes("30");
    setEvidenceUrl("");
    setNotes("");
    firstRef.current?.focus();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.querySelector<HTMLElement>("[data-cancel]")?.focus();
        }
      }}
      className="flex flex-col gap-5"
    >
      {/* Kind selector */}
      <div>
        <label className={LABEL}>Type</label>
        <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
          {KINDS.map(({ id, label, Icon }) => {
            const active = kind === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                aria-pressed={active}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14.5px] font-bold transition-colors"
                style={
                  active
                    ? { color: "#fff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: "0 10px 24px -12px rgba(225,6,0,0.6)" }
                    : { color: "var(--color-ink-soft)", border: "1px solid var(--color-hairline-strong)", background: "#fff" }
                }
              >
                <Icon size={16} strokeWidth={2.4} /> {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <label className={LABEL}>What did you learn from</label>
          <input
            ref={firstRef}
            className={FIELD}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Atomic Habits, ch. 3"
            style={{ borderColor: undefined }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
        <div>
          <label className={LABEL}>Date</label>
          <input
            type="date"
            className={FIELD}
            value={learnDate}
            max={todayIst()}
            onChange={(e) => setLearnDate(e.target.value)}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
        <div>
          <label className={LABEL}>Source Link (optional)</label>
          <input
            type="url"
            inputMode="url"
            className={FIELD}
            value={sourceUrl}
            maxLength={2000}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
        <div>
          <label className={LABEL}>Minutes</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            className={FIELD}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="30"
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
        <div className="col-span-2 max-md:col-span-1">
          <label className={LABEL}>
            Evidence Link <span style={{ color: ACCENT_DEEP }}>· required</span>
          </label>
          <input
            type="url"
            inputMode="url"
            className={FIELD}
            value={evidenceUrl}
            maxLength={2000}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="A photo, notes doc, or proof link (https://…)"
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
          <p className="mt-1 text-[12.5px] font-medium text-ink-subtle">
            Self-learning counts toward your Skill-Upgrade score only with evidence.
          </p>
        </div>
        <div className="col-span-2 max-md:col-span-1">
          <label className={LABEL}>Notes (optional)</label>
          <textarea
            className={FIELD + " min-h-[72px] resize-y"}
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key takeaway or how you'll apply it"
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
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
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} strokeWidth={2.6} />} Log Learning
        </button>
      </div>
    </form>
  );
}

/** A single self-learning row with a delete control (own rows). */
const KIND_ICON: Record<Kind, LucideIcon> = {
  book: BookText,
  video: Video,
  youtube: PlaySquare,
  other: Sparkles,
};

export function SelfLearningItem({
  id,
  kind,
  title,
  minutes,
  learnDate,
  sourceUrl,
  evidenceUrl,
  notes,
}: {
  id: string;
  kind: Kind;
  title: string;
  minutes: number;
  learnDate: string;
  sourceUrl: string | null;
  evidenceUrl: string | null;
  notes: string | null;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const Icon = KIND_ICON[kind] ?? Sparkles;

  async function onDelete() {
    if (deleting) return;
    setDeleting(true);
    const res = await deleteSelfLearning(id);
    setDeleting(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Entry removed.", type: "info" });
    router.refresh();
  }

  const dateLabel = formatDate(learnDate);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-white p-3.5">
      <span
        className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "color-mix(in srgb, #E10600 12%, transparent)", color: ACCENT_DEEP }}
      >
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="truncate text-[15px] font-bold text-ink-strong">{title}</span>
          <span className="text-[12.5px] font-semibold tabular-nums text-ink-subtle">{minutes} min · {dateLabel}</span>
        </div>
        {notes && <p className="mt-0.5 text-[13.5px] font-medium text-ink-muted" style={{ lineHeight: 1.4 }}>{notes}</p>}
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-bold" style={{ color: ACCENT_DEEP }}>
              <ExternalLink size={13} /> Source
            </a>
          )}
          {evidenceUrl && (
            <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-bold" style={{ color: ACCENT_DEEP }}>
              <ExternalLink size={13} /> Evidence
            </a>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Delete entry"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle hover:text-altus-red hover:bg-surface-soft disabled:opacity-50"
      >
        {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} strokeWidth={2.2} />}
      </button>
    </div>
  );
}
