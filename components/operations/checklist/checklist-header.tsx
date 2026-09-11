"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, Save } from "lucide-react";
import type {
  ChecklistEventRow,
  ChecklistRunRow,
  ChecklistTemplateRow,
} from "@/lib/operations/checklist";
import { formatDMY } from "@/lib/operations/checklist-dates";
import {
  createChecklistRun,
  saveRunAsTemplate,
} from "@/app/(app)/operations/checklist/actions";

const ACCENT_DEEP = "#A80400";

/**
 * The checklist header — classification and the master-template controls.
 *
 * ── IS EVENT? DECIDES THE WHOLE SCREEN ───────────────────────────────────
 * Yes reveals the event picker and turns on offsets, phases and target dates.
 * No gives a standing operational list where each row carries its own date.
 * The flag lives on the CHECKLIST rather than on each row, because an offset
 * is meaningless without a single shared anchor — a list mixing both kinds has
 * rows whose target date cannot be computed at all.
 *
 * ── THE DATE IS READ-ONLY ON PURPOSE ─────────────────────────────────────
 * Picking the event supplies the date. Offering a second, freely-typed date
 * beside it invites a checklist dated 14/03 for an event held on the 12th, with
 * nothing anywhere to flag the divergence.
 */
export function NewChecklistPanel({
  events,
  templates,
}: {
  events: ChecklistEventRow[];
  templates: ChecklistTemplateRow[];
}) {
  const router = useRouter();
  const [isEvent, setIsEvent] = React.useState(true);
  const [eventId, setEventId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chosen = events.find((e) => e.id === eventId) ?? null;

  async function submit() {
    setError(null);
    const name = title.trim() || chosen?.title || "";
    if (!name) {
      setError("Give the checklist a name.");
      return;
    }
    if (isEvent && !eventId) {
      setError("Pick the event this checklist is for.");
      return;
    }
    setBusy(true);
    try {
      const res = await createChecklistRun({
        title: name,
        isEvent,
        eventId: isEvent ? eventId : null,
        eventDate: isEvent ? (chosen?.eventDate ?? null) : null,
        templateId: templateId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/operations/checklist?run=${res.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">New checklist</h2>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label>Is Event?</Label>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setIsEvent(v)}
                className="px-4 py-1.5 text-[13px] font-medium transition-colors"
                style={
                  isEvent === v
                    ? { background: ACCENT_DEEP, color: "#fff" }
                    : { color: "#475569" }
                }
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>

        {isEvent && (
          <>
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="ck-event">Event Name</Label>
              <select
                id="ck-event"
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  // Naming the checklist after the event is right almost every
                  // time, so it is filled in HERE rather than by an effect
                  // watching the selection — and only while the field is
                  // untouched, so it never overwrites a name somebody typed.
                  if (!title.trim()) {
                    const ev = events.find((x) => x.id === e.target.value);
                    if (ev) setTitle(ev.title);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800"
              >
                <option value="">Select an event…</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {formatDMY(e.eventDate)}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-40">
              <Label>Event Date</Label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] tabular-nums text-slate-600">
                {chosen ? formatDMY(chosen.eventDate) : "—"}
              </div>
            </div>
          </>
        )}

        <div className="min-w-[200px] flex-1">
          <Label htmlFor="ck-title">Checklist name</Label>
          <input
            id="ck-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual Conference 2026"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800"
          />
        </div>

        {templates.length > 0 && (
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="ck-tpl">Start from a master</Label>
            <select
              id="ck-tpl"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800"
            >
              <option value="">Blank checklist</option>
              {templates
                .filter((t) => t.isEvent === isEvent)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.itemCount} rows)
                  </option>
                ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: ACCENT_DEEP }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
      </div>

      {error && <p className="mt-3 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}

/** Save the open checklist as a reusable master. */
export function SaveAsMasterButton({ run }: { run: ChecklistRunRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function submit() {
    const name = window.prompt("Name this master checklist", `${run.title} — standard run`);
    if (!name?.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveRunAsTemplate({ runId: run.id, name: name.trim() });
      setMsg(res.ok ? "Saved as a master checklist." : res.error);
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save as Master Checklist
      </button>
      {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
    </div>
  );
}

/**
 * Import from Job Description.
 *
 * Disabled until the JD Bank has rows. Shipped visible rather than hidden: a
 * disabled control tells the next person the integration is planned, where a
 * missing one gets re-specified from scratch in three months.
 */
export function ImportFromJdButton({ available }: { available: boolean }) {
  return (
    <button
      type="button"
      disabled={!available}
      title={
        available
          ? "Pull tasks from the HR Job Description Bank"
          : "Available once the Job Description Bank has entries flagged for Event Checklist"
      }
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Copy className="h-3.5 w-3.5" />
      Import from Job Description
    </button>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500"
    >
      {children}
    </label>
  );
}
