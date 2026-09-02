"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Paperclip, Mic } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveXFactor } from "@/app/(app)/pms/v3/actions";

export interface XFactorRow {
  id: string;
  points: string;
  evidenceKind: string;
  evidenceUrl: string | null;
  transcriptSummary: string | null;
  note: string | null;
}

/**
 * PMS v3 — Manan's X-Factor: extra points with MANDATORY evidence (a recording
 * link OR an attached + summarised transcript). Rendered only when the viewer can
 * act as Manan (the parent page gates this).
 */
export function XFactorPanel({
  subjectId,
  period,
  existing,
  maxPoints,
  accent,
  accentDeep,
}: {
  subjectId: string;
  period: string;
  existing: XFactorRow[];
  maxPoints: number;
  accent: string;
  accentDeep: string;
}) {
  const router = useRouter();
  const [points, setPoints] = React.useState<string>("");
  const [kind, setKind] = React.useState<"recording" | "transcript">("recording");
  const [url, setUrl] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();

  function submit() {
    const pts = Number(points);
    if (!Number.isFinite(pts) || pts <= 0) {
      fireToast({ message: "Enter the extra points to add.", type: "error" });
      return;
    }
    if (kind === "recording" && !url.trim()) {
      fireToast({ message: "A recording link is required.", type: "error" });
      return;
    }
    if (kind === "transcript" && !summary.trim()) {
      fireToast({ message: "Attach + summarise the transcript.", type: "error" });
      return;
    }
    start(async () => {
      const res = await saveXFactor({
        subjectId,
        period,
        points: pts,
        evidenceKind: kind,
        evidenceUrl: url.trim() || undefined,
        transcriptSummary: summary.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        fireToast({ message: `X-Factor +${pts} recorded.`, type: "success" });
        setPoints(""); setUrl(""); setSummary(""); setNote("");
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={17} strokeWidth={2.4} style={{ color: accentDeep }} />
        <span className="text-[15px] font-bold text-ink-strong">X-Factor</span>
        <span className="text-[12px] text-ink-muted">extra points · evidence mandatory · Manan-only</span>
      </div>

      {existing.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {existing.map((x) => (
            <li key={x.id} className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-soft p-2.5 text-[13px]">
              <span className="rounded-md px-2 py-0.5 text-[12px] font-black text-white" style={{ background: accent }}>
                +{Number(x.points)}
              </span>
              <span className="min-w-0 flex-1 text-ink-soft">
                <span className="font-semibold text-ink-strong capitalize">{x.evidenceKind}</span>
                {x.evidenceUrl && <> · <a href={x.evidenceUrl} className="underline" target="_blank" rel="noreferrer">link</a></>}
                {x.transcriptSummary && <> · {x.transcriptSummary}</>}
                {x.note && <span className="block text-ink-muted">{x.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={maxPoints}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={`Points (max ${maxPoints})`}
            className="w-40 rounded-lg border border-hairline bg-white px-3 py-2 text-[14px] outline-none"
          />
          <div className="inline-flex rounded-lg border border-hairline p-1" role="radiogroup" aria-label="Evidence kind">
            {([["recording", Mic], ["transcript", Paperclip]] as const).map(([k, Icon]) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setKind(k)}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-bold capitalize"
                  style={on ? { background: accent, color: "#fff" } : { color: "var(--color-ink-muted)" }}
                >
                  <Icon size={14} /> {k}
                </button>
              );
            })}
          </div>
        </div>

        {kind === "recording" ? (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Recording link (Drive / Loom / …)"
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[14px] outline-none"
          />
        ) : (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="Summarise the transcript (and attach the link above if any)"
            className="w-full resize-y rounded-lg border border-hairline bg-white px-3 py-2 text-[14px] outline-none"
          />
        )}
        {kind === "transcript" && (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Transcript attachment link (optional)"
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[13.5px] outline-none"
          />
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[13.5px] outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="brand-btn wg-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={2.6} />}
            Add X-Factor
          </button>
        </div>
      </div>
    </div>
  );
}
