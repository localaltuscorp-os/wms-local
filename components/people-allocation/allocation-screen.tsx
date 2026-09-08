"use client";

import * as React from "react";
import { Plus, Trash2, X, UserPlus, PauseCircle, PlayCircle } from "lucide-react";
import { createPortal } from "react-dom";
import {
  ALLOCATION_CATEGORIES,
  INTERN_PRODUCTS,
  HH_BATCHED_SECTIONS,
  hhCallTypeLabel,
  hhDayLabel,
} from "@/db/enums";
import { EntryForm, type EntryDraft } from "@/components/people-allocation/entry-form";

import { formatDMonY, formatHoursMinutes } from "@/lib/format";
import {
  addEntry,
  removeEntry,
  addPerson,
  setEntryHold,
} from "@/app/(app)/people-allocation/actions";
import { Kbd } from "@/components/layout/keyboard-shortcuts";
import type { HhEntry, HhPerson, HhCall, AccessActivity } from "@/lib/queries/people-allocation";

/**
 * HAND-HOLDING — pick a person, see and build their sections.
 *
 * Two rosters sit behind two tabs. Employees carry all four sections; interns
 * carry App Development only, so their tab shows that one section rather than
 * four with three permanently empty.
 *
 * Every row shown is a row someone entered. Nothing is seeded, inferred or
 * sampled — the tables start empty and stay that way until used.
 */

const ORANGE = "#ea580c";
const ORANGE_DEEP = "#c2410c";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#ea580c]/40";

/** One wording, wherever a delete is confirmed on this page. */
const DELETE_CONFIRM = "Are you sure you want to delete? This cannot be undone.";
const DELETE_PERMISSION_NOTICE = "Only Manan and Ruchita can delete a participant.";

/** PS and BSS are participants; Retainer and Ecosystem are clients. */
const PARTICIPANT_SECTIONS: readonly string[] = ["ps", "bss"];

const TABS = [
  { id: "employee", label: "Employees" },
  { id: "intern", label: "App Development (Interns)" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function AllocationScreen({
  people,
  entries,
  calls,
  ambassadorCount,
  ambassadorCalls,
  canAdd,
  canEdit,
  canDeleteEntry,
  accessActivity,
}: {
  people: HhPerson[];
  entries: HhEntry[];
  calls: HhCall[];
  /** Counted in the dashboard band; the list itself lives on its own page. */
  ambassadorCount: number;
  /** Their weekly calls, which count towards the totals alongside everyone's. */
  ambassadorCalls: HhCall[];
  /** Admin, HR or Ruchita — may add a person to a roster. */
  canAdd: boolean;
  /** Admin — may delete a person, and with them their entries and calls. */
  canEdit: boolean;
  /** Manan and Ruchita only — may remove a participant row from a section. */
  canDeleteEntry: boolean;
  /** The Access / Permissions log. */
  accessActivity: AccessActivity[];
}) {
  const [tab, setTab] = React.useState<Tab>("employee");
  const [selected, setSelected] = React.useState<Record<Tab, string>>({ employee: "", intern: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [showInsert, setShowInsert] = React.useState(false);
  // The single "+ Add" beside the tabs opens this; the section cards keep theirs.
  /**
   * The product the dialog opens on: "" for none chosen (the tab-level Add),
   * a section code when a card's own Add asks for that one. null = closed.
   */
  const [addOpen, setAddOpen] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");

  const roster = people.filter((p) => p.kind === tab);
  const personId = selected[tab];
  const person = roster.find((p) => p.id === personId) ?? null;

  // Both tabs carry all four sections. Interns are no longer App Development
  // only, and every product their form offers must have a section here to land
  // in — otherwise a saved row would exist with nowhere to show it.
  const sections = tab === "employee" ? ALLOCATION_CATEGORIES : INTERN_PRODUCTS;

  function insertPerson() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await addPerson({ name, kind: tab });
      if (res.ok) {
        setSelected((sel) => ({ ...sel, [tab]: res.id }));
        setNewName("");
        setShowInsert(false);
      } else setError(res.error);
    });
  }

  const mine = entries.filter((e) => e.personId === personId);
  // Suggestions only — every batch offered is one already in use somewhere.
  const batchOptions = [...new Set(entries.map((e) => e.batchNo).filter((b): b is string => Boolean(b)))].sort();
  // On-hold rows are excluded from the counts, per the brief.
  const countFor = (code: string) => mine.filter((e) => e.section === code && !e.onHold).length;

  /**
   * "A" opens the Add row. It targets the section under the pointer so it works
   * where you are looking; with the pointer elsewhere it falls back to the first
   * section, which is the only one interns have anyway.
   */
  const hovered = React.useRef<string | null>(null);

  React.useEffect(() => {
    // The app-wide nav shortcut is a G-then-key sequence; remember the previous
    // key so the "A" of "G A" navigates instead of opening a form here.
    let lastKey = "";
    let lastAt = 0;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(t?.isContentEditable);
      const now = Date.now();
      const afterG = lastKey === "g" && now - lastAt < 1500;
      const key = e.key.toLowerCase();

      if (key === "a" && !typing && !afterG && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const target = hovered.current ?? sections[0]?.code;
        if (target) setAddOpen(target);
      }
      lastKey = key;
      lastAt = now;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [person, sections]);

  return (
    <>
      <Dashboard
        entries={entries}
        calls={calls}
        ambassadorCount={ambassadorCount}
        ambassadorCalls={ambassadorCalls}
      />

      {/* Employees | App Development (Interns), and one Add for both. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
      <div
        className="inline-flex gap-1.5 rounded-pill p-1.5"
        role="tablist"
        aria-label="Hand-holding roster"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className="rounded-pill px-6 py-2.5 text-[14.5px] font-extrabold tracking-tight transition-colors"
              style={
                on
                  ? { background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`, color: "#fff" }
                  : { color: "var(--color-ink-soft)" }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

        <button
          type="button"
          onClick={() => {
            // No prior selection needed: the dialog names its own person, so
            // gating it on the roster would ask for the same fact twice.
            setError(null);
            setAddOpen("");
          }}
          className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2.5 text-[14px] font-extrabold text-white"
          style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
        >
          <Plus size={15} strokeWidth={2.8} /> Add
        </button>

        {/* Access / Permissions is not raised from here any more — it lives in
            the Admin Panel, whose own rail entry carries its access rules. */}
      </div>

      {addOpen !== null && (
        <AddDialog
          /* Opens on the tab you are looking at; the toggle inside decides. */
          personKind={tab}
          defaultSection={addOpen}
          batchOptions={batchOptions}
          pending={pending}
          onClose={() => setAddOpen(null)}
          onSave={(draft) => {
            setError(null);
            startTransition(async () => {
              // The dialog's own Employee/Intern pick identifies the person —
              // the server matches it to the roster, adding the name if new.
              const res = await addEntry({
                personName: draft.name,
                personKind: draft.kind,
                ...draft,
              });
              if (res.ok) {
                setAddOpen(null);
                // Land on the tab the entry was filed under, so the new row is
                // on screen rather than behind the other tab.
                setTab(draft.kind === "intern" ? "intern" : "employee");
              } else setError(res.error);
            });
          }}
        />
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          {error}
        </p>
      )}

      {/* The roster — click a name to open their sections. */}
      <section
        className="mb-5 rounded-[22px] bg-surface-card p-5"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        aria-label={tab === "employee" ? "Employees" : "Interns"}
      >
        <h2 className="mb-3 text-[15px] font-extrabold text-ink-strong">
          {tab === "employee" ? "Employees" : "App Development (Interns)"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {roster.map((p) => {
            const on = p.id === personId;
            return (
              <span
                key={p.id}
                className="inline-flex items-center rounded-pill"
                style={
                  on
                    ? { background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`, color: "#fff" }
                    : { color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSelected((s) => ({ ...s, [tab]: on ? "" : p.id }));
                  }}
                  aria-pressed={on}
                  className="rounded-pill px-4 py-2 text-[13.5px] font-bold"
                >
                  {p.name}
                </button>
                {/* No delete on either roster: removing a person takes their
                    entries and calls with them, and a name is not a row anyone
                    should be able to lose from a stray click on a chip. */}
              </span>
            );
          })}
        </div>

        {/* Add someone who is not on the list above. They join THIS tab's
            roster, so an intern added here stays App Development only. */}
        {!canAdd ? null : showInsert ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className={`${inputCls} w-[240px]`}
              value={newName}
              autoFocus
              placeholder="Person name"
              aria-label="Insert Person Name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && insertPerson()}
            />
            <button
              type="button"
              onClick={insertPerson}
              disabled={pending || !newName.trim()}
              className="wg-btn rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
            >
              Add
            </button>
            <button
              type="button"
              aria-label="Cancel"
              onClick={() => {
                setShowInsert(false);
                setNewName("");
              }}
              className="rounded-lg p-2 text-ink-subtle hover:bg-black/5"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInsert(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold"
            style={{ color: ORANGE }}
          >
            <UserPlus size={14} strokeWidth={2.6} /> Insert Person Name
          </button>
        )}
      </section>

      {!person ? (
        <section
          className="rounded-[22px] bg-surface-card p-14 text-center"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <p className="text-[15px] font-bold text-ink-strong">Select a name above</p>
          <p className="mt-1 text-[13.5px] text-ink-subtle">
            Their {tab === "employee" ? "four sections" : "App Development section"} will open here.
          </p>
        </section>
      ) : (
        <>
          {/* Allocation overview for the selected person. */}
          <section
            className="mb-5 rounded-[22px] bg-surface-card p-5"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            aria-label="Allocation overview"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-ink-strong">{person.name}</h2>
              <span className="text-[12.5px] font-semibold text-ink-subtle">Allocation overview</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {sections.map((c) => (
                <div
                  key={c.code}
                  className="min-w-[170px] flex-1 rounded-xl px-4 py-3"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                >
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{c.full}</div>
                  <div className="mt-0.5 text-[24px] font-extrabold leading-none tracking-tight text-ink-strong">
                    {countFor(c.code)}
                  </div>
                </div>
              ))}
              <div
                className="min-w-[170px] flex-1 rounded-xl px-4 py-3"
                style={{
                  background: `color-mix(in srgb, ${ORANGE} 10%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 30%, transparent)`,
                }}
              >
                <div className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: ORANGE_DEEP }}>
                  Total
                </div>
                <div
                  className="mt-0.5 text-[24px] font-extrabold leading-none tracking-tight"
                  style={{ color: ORANGE_DEEP }}
                >
                  {mine.length}
                </div>
              </div>
            </div>
          </section>

          {/* One bordered card per section, each with its own Add. */}
          <div className="flex flex-col gap-5">
            {sections.map((c) => (
              <SectionCard
                key={c.code}
                canDeleteEntry={canDeleteEntry}
                section={c.code}
                title={c.full}
                rows={mine.filter((e) => e.section === c.code)}
                calls={calls}
                run={startTransition}
                onError={setError}
                onAdd={() => setAddOpen(c.code)}
                onHover={(on) => {
                  hovered.current = on ? c.code : hovered.current === c.code ? null : hovered.current;
                }}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * "Add Employee / Intern" — the tab-level Add opens the same form the section
 * cards use, in a dialog, so there is one form to learn and one to maintain.
 *
 * Portalled to <body> so the page's stacking contexts and overflow clipping
 * cannot crop it, and the backdrop covers the whole viewport.
 */
function AddDialog({
  personKind,
  defaultSection,
  batchOptions,
  pending,
  onSave,
  onClose,
}: {
  personKind: string;
  defaultSection: string;
  batchOptions: string[];
  pending: boolean;
  onSave: (draft: EntryDraft) => void;
  onClose: () => void;
}) {
  // Escape closes, and the page behind must not scroll under the dialog.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-6 max-md:p-3"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        // Only a click on the backdrop itself closes — not a drag out of a field.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Employee / Intern"
        className="wg-rise mt-[8vh] w-full max-w-[1080px] rounded-[22px] bg-surface-card p-5"
        style={{
          boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 30px 70px -30px rgba(15,23,42,0.45)",
        }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-4">
          <h2 className="text-[16px] font-extrabold text-ink-strong">Add Employee / Intern</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <EntryForm
            personKind={personKind}
            defaultSection={defaultSection}
            batchOptions={batchOptions}
            pending={pending}
            onSave={onSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The totals band. On-hold rows are excluded throughout — from the head count,
 * from the call count and from the weekly hours — because someone on hold is
 * not being hand-held this week.
 */
function Dashboard({
  entries,
  calls,
  ambassadorCount,
  ambassadorCalls,
}: {
  entries: HhEntry[];
  calls: HhCall[];
  ambassadorCount: number;
  ambassadorCalls: HhCall[];
}) {
  const live = entries.filter((e) => !e.onHold);
  const liveIds = new Set(live.map((e) => e.id));
  // Ambassador calls arrive pre-filtered to the live ones.
  const liveCalls = [...calls.filter((c) => liveIds.has(c.entryId)), ...ambassadorCalls];

  // `section` is nullable in the table; a row without one is not a participant,
  // which is what the empty string already fails to match. Behaviour unchanged.
  const participants = live.filter((e) => PARTICIPANT_SECTIONS.includes(e.section ?? "")).length;
  const clients = live.length - participants;
  const minutes = liveCalls.reduce((sum, c) => sum + (c.durationMin ?? 0), 0);
  // HH:MM, not a decimal: these are clock times, and "03:30" needs no
  // arithmetic to read the way "3.5" does.
  const hours = formatHoursMinutes(minutes);

  const tiles = [
    { label: "Participants", value: participants },
    { label: "Clients", value: clients },
    { label: "Ambassadors", value: ambassadorCount },
    { label: "Total People", value: live.length + ambassadorCount, accent: true },
    { label: "Total Calls", value: liveCalls.length },
    { label: "Total Hours", value: hours },
  ];

  return (
    <section
      className="mb-5 rounded-[22px] bg-surface-card p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="Hand-holding dashboard"
    >
      <h2 className="mb-3 text-[15px] font-extrabold text-ink-strong">Dashboard</h2>
      <div className="flex flex-wrap gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="min-w-[150px] flex-1 rounded-xl px-4 py-3"
            style={
              t.accent
                ? {
                    background: `color-mix(in srgb, ${ORANGE} 10%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 30%, transparent)`,
                  }
                : { boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
            }
          >
            <div
              className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
              style={{ color: t.accent ? ORANGE_DEEP : "var(--color-ink-subtle)" }}
            >
              {t.label}
            </div>
            <div
              className="mt-0.5 text-[24px] font-extrabold leading-none tracking-tight"
              style={{ color: t.accent ? ORANGE_DEEP : "var(--color-ink-strong)" }}
            >
              {t.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionCard({
  section,
  title,
  rows,
  calls,
  run,
  canDeleteEntry,
  onError,
  onAdd,
  onHover,
}: {
  /** Manan and Ruchita only — the row bin is hidden for everyone else. */
  canDeleteEntry: boolean;
  section: string;
  title: string;
  rows: HhEntry[];
  calls: HhCall[];
  run: (fn: () => void) => void;
  onError: (s: string | null) => void;
  /** Opens the shared Add dialog on this card's section. */
  onAdd: () => void;
  onHover: (on: boolean) => void;
}) {
  // Batch No. is a PS/BSS idea, so the column only exists in those sections.
  const sectionBatched = HH_BATCHED_SECTIONS.includes(section);
  const cols = sectionBatched ? 7 : 6;
  function confirmDelete(row: HhEntry) {
    if (!confirm(DELETE_CONFIRM)) return;
    run(async () => {
      const res = await removeEntry(row.id);
      if (!res.ok) onError(res.error);
    });
  }

  return (
    <section
      className="rounded-[22px] bg-surface-card p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label={title}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink-strong">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="max-md:hidden" title="Press A to add">
            <Kbd>A</Kbd>
          </span>
          <button
            type="button"
            onClick={onAdd}
            className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
          >
            <Plus size={14} strokeWidth={2.8} /> Add
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr
              className="text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle"
              style={{ background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)" }}
            >
              <th className="w-[54px] px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Name</th>
              {sectionBatched && <th className="w-[110px] px-4 py-2.5">Batch No.</th>}
              <th className="w-[140px] px-4 py-2.5">Start Date</th>
              <th className="w-[140px] px-4 py-2.5">End Date</th>
              <th className="px-4 py-2.5">Weekly Calls</th>
              <th className="w-[96px] px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-hairline">
                <td colSpan={cols} className="px-4 py-6 text-center text-[13px] text-ink-subtle">
                  No entries yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const mine = calls.filter((c) => c.entryId === r.id);
                return (
                  <tr
                    key={r.id}
                    className="border-t border-hairline transition-colors hover:bg-black/[0.02]"
                    /* On hold reads as set aside, not as gone. */
                    style={r.onHold ? { opacity: 0.55 } : undefined}
                  >
                    <td className="px-4 py-3 tabular-nums text-ink-subtle">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-ink-strong">
                      {r.name}
                      {r.onHold && (
                        <span
                          className="ml-2 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                          style={{
                            background: "color-mix(in srgb, var(--color-ink-strong) 7%, transparent)",
                            color: "var(--color-ink-soft)",
                          }}
                        >
                          On Hold
                        </span>
                      )}
                    </td>
                    {sectionBatched && <td className="px-4 py-3 tabular-nums">{r.batchNo || "-"}</td>}
                    <td className="px-4 py-3 tabular-nums">{r.startDate ? formatDMonY(r.startDate) : "-"}</td>
                    <td className="px-4 py-3 tabular-nums">{r.endDate ? formatDMonY(r.endDate) : "-"}</td>
                    <td className="px-4 py-3">
                      {mine.length === 0 ? (
                        <span className="text-ink-subtle">{"-"}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {mine.map((c) => (
                            <span
                              key={c.id}
                              className="rounded-pill px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft"
                              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                            >
                              {hhCallTypeLabel(c.callType)} · {hhDayLabel(c.day)} · {c.durationMin}m
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={r.onHold ? `Resume ${r.name}` : `Hold ${r.name}`}
                          title={r.onHold ? "Resume" : "Put on hold"}
                          onClick={() =>
                            run(async () => {
                              const res = await setEntryHold(r.id, !r.onHold);
                              if (!res.ok) onError(res.error);
                            })
                          }
                          className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                        >
                          {r.onHold ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                        </button>
                        {/* Manan and Ruchita only — the row carries its weekly
                            calls with it. Shown DISABLED rather than hidden for
                            everyone else: a missing bin reads as a bug, a greyed
                            one says the control exists and is not yours. */}
                        {canDeleteEntry ? (
                          <button
                            type="button"
                            aria-label={`Remove ${r.name}`}
                            onClick={() => confirmDelete(r)}
                            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <span
                            aria-disabled
                            title={DELETE_PERMISSION_NOTICE}
                            className="cursor-not-allowed rounded-lg p-1.5 text-ink-subtle opacity-40"
                          >
                            <Trash2 size={14} />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
