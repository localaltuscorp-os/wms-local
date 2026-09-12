"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Plus, Save } from "lucide-react";
import type {
  ChecklistEventRow,
  ChecklistRunRow,
  ChecklistTemplateRow,
} from "@/lib/operations/checklist";
import { formatDMY } from "@/lib/operations/checklist-dates";
import {
  createChecklistEvent,
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
 *
 * ── ADD EVENT SITS AT THE BOTTOM OF THE PICKER ───────────────────────────
 * "The event I need is not in this list" is the first wall anybody hits, and
 * the way out used to be: leave this screen, find the Monthly Events Master,
 * add it there, come back, and rebuild the form from memory. The last row of
 * the dropdown now opens a two-field form in place. It writes a real calendar
 * event (see createChecklistEvent) rather than a name local to this screen —
 * a second list of event names drifts from the calendar within a week.
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

  /* Events created here, held locally until the server render catches up.
     Without this the new event is selected but its <option> does not exist for
     the second the refresh takes, and the picker blinks back to "Select an
     event…" — which reads as the save having failed. */
  const [added, setAdded] = React.useState<ChecklistEventRow[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDate, setNewDate] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addBusy, setAddBusy] = React.useState(false);

  const allEvents = React.useMemo(() => {
    const seen = new Set(events.map((e) => e.id));
    return [...events, ...added.filter((e) => !seen.has(e.id))].sort((a, b) =>
      a.eventDate.localeCompare(b.eventDate),
    );
  }, [events, added]);

  const chosen = allEvents.find((e) => e.id === eventId) ?? null;

  /* A sentinel option value, not a real id. It is intercepted in onChange and
     never reaches `eventId`, so nothing downstream has to know it exists. */
  const ADD_NEW = "__add_event__";

  async function addEvent() {
    setAddError(null);
    const name = newName.trim();
    if (!name) {
      setAddError("Give the event a name.");
      return;
    }
    if (!newDate) {
      setAddError("Pick the date it happens on.");
      return;
    }
    setAddBusy(true);
    try {
      const res = await createChecklistEvent({ title: name, eventDate: newDate });
      if (!res.ok) {
        setAddError(res.error);
        return;
      }
      const row: ChecklistEventRow = {
        id: res.id,
        title: res.title,
        eventDate: res.eventDate,
        categoryName: null,
      };
      setAdded((prev) => [...prev, row]);
      setEventId(row.id);
      // Same rule as picking an existing event: name the checklist after it,
      // but never over something already typed.
      if (!title.trim()) setTitle(row.title);
      setAdding(false);
      setNewName("");
      setNewDate("");
      // Bring the server's own list up to date in the background; `added`
      // covers the gap and de-duplicates when it lands.
      router.refresh();
    } finally {
      setAddBusy(false);
    }
  }

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
                  const v = e.target.value;
                  if (v === ADD_NEW) {
                    // The sentinel is a command, not a value: open the form and
                    // leave the selection exactly as it was, so cancelling
                    // costs nothing.
                    setAdding(true);
                    setAddError(null);
                    return;
                  }
                  setEventId(v);
                  // Naming the checklist after the event is right almost every
                  // time, so it is filled in HERE rather than by an effect
                  // watching the selection — and only while the field is
                  // untouched, so it never overwrites a name somebody typed.
                  if (!title.trim()) {
                    const ev = allEvents.find((x) => x.id === v);
                    if (ev) setTitle(ev.title);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800"
              >
                <option value="">Select an event…</option>
                {allEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {formatDMY(e.eventDate)}
                  </option>
                ))}
                {/* LAST, under a rule: it is an action among nouns, and a
                    reader scanning for their event should reach the end of the
                    real ones before meeting it. */}
                <option disabled>──────────</option>
                <option value={ADD_NEW}>＋ Add event…</option>
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

      {/* ── Add event, in place ─────────────────────────────────────────────
          Two fields and nothing else. Everything the calendar can hold — time,
          location, category, notes — is left to the Monthly Events Master; what
          a checklist needs from an event is its name and the day it falls on. */}
      {isEvent && adding && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" style={{ color: ACCENT_DEEP }} />
            <h3 className="text-[13px] font-bold text-slate-900">Add an event</h3>
            <span className="text-[12px] text-slate-500">
              It joins the company calendar, so everyone sees the same date.
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="ck-new-event">Event name</Label>
              <input
                id="ck-new-event"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Vendor Audit — Nashik"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addEvent();
                  }
                  if (e.key === "Escape") setAdding(false);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800"
              />
            </div>

            <div className="w-44">
              <Label htmlFor="ck-new-date">Event date</Label>
              <input
                id="ck-new-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addEvent();
                  }
                  if (e.key === "Escape") setAdding(false);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] tabular-nums text-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={addEvent}
              disabled={addBusy}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: ACCENT_DEEP }}
            >
              {addBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add event
            </button>

            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>

          {addError && <p className="mt-2.5 text-[13px] text-red-700">{addError}</p>}
        </div>
      )}

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
