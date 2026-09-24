"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, Star, Users } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect } from "@/components/ui/lookup-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { StarRating } from "@/components/ui/star-rating";
import { createSession } from "@/app/(app)/training/calendar/actions";
import {
  TRAINING_TYPES,
  TRAINING_TYPE_LABELS,
  AUDIENCE_SCOPES,
  AUDIENCE_SCOPE_LABELS,
} from "@/db/enums";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-3 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

export function ScheduleTraining({
  subjectOptions,
  employeeOptions,
  functionOptions,
  maxSessionMinutes,
  onAddSubject,
}: {
  subjectOptions: { id: string; name: string }[];
  employeeOptions: { id: string; name: string }[];
  functionOptions: { id: string; name: string }[];
  maxSessionMinutes: number;
  onAddSubject?: (name: string) => Promise<{ ok: true; option: { id: string; name: string } } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [topic, setTopic] = React.useState("");
  const [los, setLos] = React.useState("");
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [trainerId, setTrainerId] = React.useState<string | null>(null);
  const [functionId, setFunctionId] = React.useState<string | null>(null);
  const [trainingType, setTrainingType] = React.useState<string>("other");
  const [audienceScope, setAudienceScope] = React.useState<string>("my_team");
  const [criticality, setCriticality] = React.useState(3);
  const [scheduledAt, setScheduledAt] = React.useState(defaultSlot());
  const [durationMin, setDurationMin] = React.useState(60);
  const [mode, setMode] = React.useState<"in_person" | "online">("in_person");
  const [location, setLocation] = React.useState("");
  const [meetingUrl, setMeetingUrl] = React.useState("");
  const [recurrence, setRecurrence] = React.useState("none");
  const [requiredIds, setRequiredIds] = React.useState<string[]>([]);
  const [optionalIds, setOptionalIds] = React.useState<string[]>([]);

  const empMulti = employeeOptions.map((e) => ({ value: e.id, label: e.name }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (topic.trim().length < 2) {
      fireToast({ message: "Add a topic.", type: "error" });
      return;
    }
    setPending(true);
    const res = await createSession({
      topic: topic.trim(),
      subjectId,
      los: los.trim() || null,
      criticality,
      trainerId,
      functionId,
      trainingType: trainingType as (typeof TRAINING_TYPES)[number],
      audienceScope: audienceScope as (typeof AUDIENCE_SCOPES)[number],
      scheduledAt: new Date(scheduledAt).toISOString(),
      durationMin,
      mode,
      location: location.trim() || null,
      meetingUrl: meetingUrl.trim() || null,
      recurrenceRule: recurrence === "none" ? null : recurrence,
      attendeeIds: requiredIds,
      optionalAttendeeIds: optionalIds,
      notes: null,
      inManual: false,
    });
    setPending(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: "Training scheduled.", type: "success" });
    router.push("/training/calendar");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div>
        <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Topic</label>
        <input className={INPUT} value={topic} maxLength={200} placeholder="e.g. Objection-handling framework" onChange={(e) => setTopic(e.target.value)} />
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
          Learning Outcome Statement <span className="font-semibold normal-case tracking-normal text-ink-subtle/80">— required</span>
        </label>
        <textarea className={INPUT + " resize-y"} rows={2} maxLength={2000} value={los}
          placeholder="After this training, participants will be able to…"
          onChange={(e) => setLos(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Subject / Topic</label>
          <LookupSelect label="subject" value={subjectId} onChange={setSubjectId} options={subjectOptions} onAdd={onAddSubject} className={INPUT} placeholder="Pick a subject…" />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Function</label>
          <LookupSelect label="function" value={functionId} onChange={setFunctionId} options={functionOptions} className={INPUT} placeholder="Pick a function…" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Trainer</label>
          <LookupSelect label="trainer" value={trainerId} onChange={setTrainerId} options={employeeOptions} className={INPUT} placeholder="Defaults to you…" />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Training Type</label>
          <select className={INPUT} value={trainingType} onChange={(e) => setTrainingType(e.target.value)}>
            {TRAINING_TYPES.map((t) => (
              <option key={t} value={t}>{TRAINING_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Criticality</label>
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3.5 py-2.5">
            <StarRating value={criticality} onChange={setCriticality} color={ACCENT} label="Criticality 1 to 5" />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Audience</label>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_SCOPES.map((s) => {
            const active = audienceScope === s;
            return (
              <button key={s} type="button" onClick={() => setAudienceScope(s)}
                className="rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors"
                style={{ borderColor: active ? ACCENT : "var(--color-hairline)", background: active ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : "white", color: active ? ACCENT_DEEP : "var(--color-ink-soft)" }}>
                {AUDIENCE_SCOPE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Schedule</label>
          <div className="relative">
            <Calendar size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input type="datetime-local" className={INPUT + " pl-9"} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Duration (min)</label>
          <input type="number" min={5} max={maxSessionMinutes} step={5} className={INPUT} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Recurrence</label>
          <select className={INPUT} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="none">One-time</option>
            <option value="FREQ=WEEKLY">Weekly</option>
            <option value="FREQ=MONTHLY">Monthly</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Mode</label>
          <div className="flex gap-2">
            {(["in_person", "online"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className="flex-1 rounded-xl border px-3 py-3 text-[14px] font-bold"
                style={{ borderColor: mode === m ? ACCENT : "var(--color-hairline)", background: mode === m ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : "white", color: mode === m ? ACCENT_DEEP : "var(--color-ink-soft)" }}>
                {m === "in_person" ? "In Person" : "Online"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{mode === "online" ? "Meeting URL" : "Location"}</label>
          <input className={INPUT} value={mode === "online" ? meetingUrl : location}
            placeholder={mode === "online" ? "https://meet.google.com/…" : "e.g. Conference room"}
            onChange={(e) => (mode === "online" ? setMeetingUrl(e.target.value) : setLocation(e.target.value))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Required attendees</label>
          <div className="rounded-xl border border-hairline bg-white px-3 py-2.5">
            <MultiSelect options={empMulti} selected={requiredIds} onChange={setRequiredIds} placeholder="Mandatory participants…" className="w-full" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Optional attendees</label>
          <div className="rounded-xl border border-hairline bg-white px-3 py-2.5">
            <MultiSelect options={empMulti} selected={optionalIds} onChange={setOptionalIds} placeholder="May attend…" className="w-full" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
          {pending ? <Loader2 size={17} className="animate-spin" /> : <Users size={17} />}
          {pending ? "Scheduling…" : "Schedule Training"}
        </button>
      </div>
    </form>
  );
}

function defaultSlot(): string {
  const now = new Date();
  const day = now.getDay();
  const toFri = (5 - day + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + toFri);
  d.setHours(16, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
