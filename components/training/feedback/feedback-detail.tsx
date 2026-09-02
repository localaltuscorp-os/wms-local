"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2, Check, AlertTriangle, ShieldCheck, Archive, Trash2, CornerUpRight, Sparkles } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { blobToWavBase64 } from "@/lib/audio/to-wav";
import { StarRating } from "./star-rating";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { escalateFeedback, resolveFeedback, signOffFeedback, archiveFeedback, deleteFeedback } from "@/app/(app)/training/feedback/actions";
import type { FeedbackDetail as FD } from "@/lib/queries/feedback";
import { FEEDBACK_TEMPLATES, fillTemplate, type FeedbackType } from "@/lib/training/feedback-templates";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-hairline py-3 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
      <span className="text-[15px] font-semibold text-ink-strong" style={{ overflowWrap: "anywhere" }}>{children}</span>
    </div>
  );
}

export function FeedbackDetailView({ fb, canManage, employees }: { fb: FD; canManage: boolean; employees: LookupOption[] }) {
  const router = useRouter();
  const tpl = FEEDBACK_TEMPLATES[fb.type as FeedbackType];
  const [busy, setBusy] = React.useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = React.useState(false);
  const [escalateOpen, setEscalateOpen] = React.useState(false);
  const [how, setHow] = React.useState("");
  const [escTo, setEscTo] = React.useState<string | null>(null);
  const [sumBusy, setSumBusy] = React.useState(false);
  const [ai, setAi] = React.useState<{ summary: string; transcript: string } | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error || "Failed.", type: "error" });
    fireToast({ message: okMsg, type: "success" });
    router.refresh();
  }

  /** AI transcribe + summarize the saved voice note. English stays English; Hindi → Hinglish. */
  async function summarizeVoice() {
    if (!fb.voiceUrl) return;
    setSumBusy(true);
    try {
      const blob = await (await fetch(fb.voiceUrl)).blob();
      const { base64, mimeType } = await blobToWavBase64(blob);
      const r = await fetch("/api/training/summarize-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });
      const j = await r.json();
      if (!j.ok) return fireToast({ message: j.error || "Couldn't summarize.", type: "error" });
      setAi({ summary: (j.summary ?? "").trim(), transcript: (j.transcript ?? "").trim() });
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Couldn't process the audio.", type: "error" });
    } finally {
      setSumBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-[1.5fr_1fr] gap-6 max-lg:grid-cols-1 items-start">
      {/* LEFT — the case */}
      <section className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <div className="mb-4 rounded-xl border border-hairline bg-surface-soft p-4">
          <p className="text-[15px] font-semibold text-ink-strong" style={{ lineHeight: 1.45 }}>{fillTemplate(tpl?.ratingQuestion ?? "Rating", fb.ratedName)}</p>
          <div className="mt-2"><StarRating value={fb.rating} readOnly /></div>
        </div>
        <Row label={tpl?.ratedLabel ?? "Rated"}>{fb.ratedName}</Row>
        {fb.clientName && <Row label="Client / participant">{fb.clientName}</Row>}
        {fb.service && <Row label="Service">{fb.service}</Row>}
        <Row label="Type">{tpl?.label ?? fb.type}</Row>
        {fb.q1 && <Row label={tpl?.q1 ?? "Q1"}>{fb.q1}</Row>}
        {fb.q2 && <Row label={tpl?.q2 ?? "Q2"}>{fb.q2}</Row>}
        {fb.voiceTranscript && <Row label="Transcript">{fb.voiceTranscript}</Row>}
        {fb.voiceUrl && (
          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Voice note</span>
            <audio controls src={fb.voiceUrl} className="w-full" />
            <button type="button" onClick={summarizeVoice} disabled={sumBusy} className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-bold transition-colors disabled:opacity-60" style={{ borderColor: "color-mix(in srgb, var(--color-purple) 40%, transparent)", color: "var(--color-purple-deep)", background: "color-mix(in srgb, var(--color-purple) 8%, transparent)" }}>
              {sumBusy ? <><Loader2 size={14} className="animate-spin" /> Transcribing & summarizing…</> : <><Sparkles size={14} /> Summarize with AI · English / Hindi→Hinglish</>}
            </button>
            {ai && (
              <div className="mt-2 rounded-xl border border-hairline bg-surface-soft p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--color-purple-deep)" }}>AI summary</div>
                <p className="mt-1 text-[14px] font-semibold text-ink-strong" style={{ overflowWrap: "anywhere" }}>{ai.summary || "—"}</p>
                {ai.transcript && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12.5px] font-bold text-ink-soft">Full Transcript</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[13.5px] font-medium text-ink-soft" style={{ overflowWrap: "anywhere" }}>{ai.transcript}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
        {fb.pictureUrl && <div className="mt-3"><span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Picture</span>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={fb.pictureUrl} alt="attachment" className="max-h-72 rounded-lg border border-hairline" /></div>}
      </section>

      {/* RIGHT — status + actions */}
      <aside className="flex flex-col gap-4">
        {/* Resolution status — visible to participant */}
        <div className="rounded-section border p-5" style={fb.resolution ? { borderColor: "color-mix(in srgb, var(--color-green) 40%, transparent)", background: "color-mix(in srgb, var(--color-green) 7%, transparent)" } : { borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}>
          <div className="flex items-center gap-2">
            {fb.resolution ? <Check size={18} strokeWidth={2.8} style={{ color: "var(--color-green-deep)" }} /> : fb.overdue ? <AlertTriangle size={18} style={{ color: "var(--color-altus-red)" }} /> : <CornerUpRight size={18} style={{ color: "var(--color-ink-muted)" }} />}
            <h3 className="font-bold text-ink-strong" style={{ fontSize: 16 }}>{fb.resolution ? "Resolved" : fb.escalate ? "Escalated" : "Open"}</h3>
          </div>
          {fb.resolution && fb.resolutionHow && <p className="mt-2 text-[14px] font-medium text-ink-soft" style={{ overflowWrap: "anywhere" }}>{fb.resolutionHow}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-semibold text-ink-subtle">
            <span>TAT: {fb.resolution ? `${fb.tatHours}h` : fb.overdue ? "over 72h" : "within 72h"}</span>
            {fb.signedOff && <span style={{ color: "var(--color-green-deep)" }}>Signed off{fb.signedOffByName ? ` · ${fb.signedOffByName}` : ""}</span>}
            {fb.escalatedToName && <span>Escalated to {fb.escalatedToName}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-section border border-hairline bg-surface-card p-5 flex flex-col gap-3" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          {!fb.resolution && (
            <>
              {!resolveOpen ? (
                <button type="button" onClick={() => setResolveOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))" }}><Check size={16} strokeWidth={2.6} /> Mark Resolved</button>
              ) : (
                <div className="flex flex-col gap-2">
                  <textarea className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-[color:var(--color-altus-red)] min-h-[72px]" value={how} onChange={(e) => setHow(e.target.value)} placeholder="How was it resolved?" />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === "resolve"} onClick={() => run("resolve", () => resolveFeedback({ id: fb.id, resolutionHow: how }), "Marked resolved.")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))" }}>{busy === "resolve" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
                    <button type="button" onClick={() => setResolveOpen(false)} className="rounded-xl border border-hairline bg-white px-4 text-[14px] font-bold text-ink-soft">Cancel</button>
                  </div>
                </div>
              )}
              {!fb.escalate && (
                !escalateOpen ? (
                  <button type="button" onClick={() => setEscalateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-hairline bg-white py-3 text-[15px] font-bold text-ink-strong hover:border-altus-red"><CornerUpRight size={16} /> Escalate</button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <LookupSelect label="consultant" value={escTo} onChange={setEscTo} options={employees} className="w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-2.5 text-[14.5px] outline-none focus:border-[color:var(--color-altus-red)]" placeholder="Escalate to…" />
                    <div className="flex gap-2">
                      <button type="button" disabled={busy === "esc"} onClick={() => run("esc", () => escalateFeedback(fb.id, escTo), "Escalated.")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-amber), var(--color-amber-deep))" }}>{busy === "esc" ? <Loader2 size={15} className="animate-spin" /> : <CornerUpRight size={15} />} Escalate</button>
                      <button type="button" onClick={() => setEscalateOpen(false)} className="rounded-xl border border-hairline bg-white px-4 text-[14px] font-bold text-ink-soft">Cancel</button>
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {fb.resolution && !fb.signedOff && canManage && (
            <button type="button" disabled={busy === "sign"} onClick={() => run("sign", () => signOffFeedback(fb.id), "Signed off.")} className="inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))" }}>{busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={16} />} Manager Sign-off</button>
          )}

          {canManage && (
            <div className="flex gap-2 border-t border-hairline pt-3">
              <button type="button" disabled={busy === "arch"} onClick={() => run("arch", () => archiveFeedback(fb.id, !fb.archived), fb.archived ? "Unarchived." : "Archived.")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white py-2.5 text-[13.5px] font-bold text-ink-soft hover:border-ink-subtle"><Archive size={14} /> {fb.archived ? "Unarchive" : "Archive"}</button>
              <button type="button" disabled={busy === "del"} onClick={() => { if (confirm("Delete this feedback permanently?")) run("del", () => deleteFeedback(fb.id).then((r) => { if (r.ok) router.push("/training/feedback" as Route); return r; }), "Deleted."); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-2.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red hover:border-altus-red"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
