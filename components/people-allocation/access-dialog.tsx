"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, Crown, User, Info, Trash2, FileText, ChevronDown, Undo2, UserRoundPlus } from "lucide-react";
import {
  HH_ACCESS_ROLES,
  HH_ACCESS_MODULES,
  hhAccessRole,
  HH_ACCESS_SECTIONS,
  hhAccessSectionLabel,
  hhActionsFor,
  hhNamesFor,
} from "@/db/enums";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import {
  addAccessActivity,
  removeAccessActivity,
  updateAccessActivity,
} from "@/app/(app)/people-allocation/actions";
import type { AccessActivity } from "@/lib/queries/people-allocation";

/**
 * HAND-HOLDING · ACCESS / PERMISSIONS.
 *
 * Three roles, one fixed matrix: Admin adds, edits, deletes and views; HR and
 * Ruchita add and view. Edit and Delete are not offered to HR or Ruchita at
 * all — the Action dropdown is built from the role, so a dropdown never lists
 * an action the server would then refuse.
 *
 * The form above composes Access Activity rows — one per selected module — and
 * SAVE is the only thing that writes them. Cancel drops them.
 *
 * Deleting is reversible for ten seconds: the row leaves the table at once and
 * an Undo appears, but the server is not told until the countdown ends. Undo
 * therefore restores the row exactly as it was, because it was never deleted.
 */

/** How long a deleted entry can be taken back. */
const UNDO_WINDOW_MS = 10_000;

const ORANGE = "#ea580c";
const ORANGE_DEEP = "#c2410c";
const RED = "var(--color-altus-red)";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2.5 text-[14px] text-ink-strong outline-none transition placeholder:text-ink-subtle focus:border-transparent focus:ring-2 focus:ring-[#ea580c]/40";

const labelCls = "mb-1.5 block text-[12.5px] font-bold text-ink-strong";

const DESCRIPTION_MAX = 250;

/**
 * The Time column, formatted identically on the server and in the browser.
 *
 * The zone is PINNED. Without it the server renders in its own zone and the
 * browser in the viewer's, React sees two different strings for the same cell,
 * and the whole tree is thrown away and re-rendered on the client — the
 * "Hydration failed" this table used to log on every load.
 */
const TIME_ZONE = "Asia/Kolkata";
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});
// en-IN gives "am"/"pm"; the column reads AM/PM.
const formatTime = (iso: string) => timeFormat.format(new Date(iso)).toUpperCase();

/** The Admin Panel's two bulk-add buttons, in the panel's red. */
const BULK_ADD = [
  { section: "ps", label: "Bulk Add PS" },
  { section: "bss", label: "Bulk Add BSS" },
] as const;


/** Action code → the word the Action column shows. */
const ACTION_PAST: Record<string, { label: string; fg: string; bg: string }> = {
  add: { label: "Added", fg: "#15803d", bg: "color-mix(in srgb, #16a34a 12%, transparent)" },
  delete: { label: "Deleted", fg: "#b91c1c", bg: "color-mix(in srgb, #dc2626 10%, transparent)" },
  edit: { label: "Edited", fg: "#1d4ed8", bg: "color-mix(in srgb, #2563eb 10%, transparent)" },
  view: { label: "Viewed", fg: "var(--color-ink-soft)", bg: "color-mix(in srgb, #64748b 12%, transparent)" },
};

function Select({
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder: string;
  options: readonly { code: string; label: string }[];
}) {
  return (
    <span className="relative block">
      <select
        className={`${inputCls} appearance-none pr-9`}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
    </span>
  );
}

/** A row waiting to be saved — same shape as a stored one, minus the id. */
interface StagedRow {
  key: string;
  role: string;
  module: string;
  section: string;
  personName: string;
  action: string;
  description: string | null;
}

/** A compact select for editing one stored Access Activity cell in place. */
function RowSelect({
  value,
  options,
  ariaLabel,
  disabled,
  extra,
  onChange,
}: {
  value: string;
  options: readonly { code: string; label: string }[];
  ariaLabel: string;
  disabled: boolean;
  /** A stored value that predates the list stays selectable, never rewritten. */
  extra?: string;
  onChange: (v: string) => void;
}) {
  const known = options.some((o) => o.code === value);
  return (
    <span className="relative block">
      <select
        className="w-full appearance-none rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1.5 pr-7 text-[13px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#ea580c]/40 disabled:opacity-60"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
        {!known && extra && <option value={extra}>{extra}</option>}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </span>
  );
}

/**
 * A description, typed in the row and saved when the field is left. Held
 * locally while editing so a half-typed sentence is never written.
 */
function RowDescription({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <input
      type="text"
      className="w-full rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1.5 text-[13px] text-ink-strong outline-none transition placeholder:text-ink-subtle focus:border-transparent focus:ring-2 focus:ring-[#ea580c]/40 disabled:opacity-60"
      value={draft}
      disabled={disabled}
      placeholder="Add a description"
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function AccessDialog({
  canEdit,
  activity,
  onClose,
  variant = "dialog",
  onBulkAdd,
}: {
  canEdit: boolean;
  activity: AccessActivity[];
  onClose: () => void;
  /**
   * "dialog" — the modal the Hand-holding page opens (unchanged default).
   * "page"   — the same surface rendered inline, for the Admin Panel. One
   *            component, so the two can never drift apart.
   */
  variant?: "dialog" | "page";
  /** Admin Panel only — what "Bulk Add PS" / "Bulk Add BSS" should do. */
  onBulkAdd?: (section: string) => void;
}) {
  const [role, setRole] = React.useState<string>("hr");
  /**
   * Modules are MULTI-select: one grant often covers several at once. Stored
   * one row per module (the log's `module` column stays a single value), so a
   * later read never has to split a joined string back apart.
   */
  const [modules, setModules] = React.useState<string[]>([HH_ACCESS_MODULES[0].code]);
  const [section, setSection] = React.useState<string>(HH_ACCESS_SECTIONS[0].code);
  const [personName, setPersonName] = React.useState("");
  const [action, setAction] = React.useState("add");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  /** Rows whose delete is counting down. Held whole, so Undo needs no re-read. */
  const [pendingDeletes, setPending] = React.useState<{ row: AccessActivity; at: number }[]>([]);
  /**
   * Ids whose countdown has finished and whose delete is now in flight. They
   * stay hidden: the row is still in `activity` until the server confirms and
   * the page revalidates, and letting it flash back for that round-trip made a
   * 10-second undo look far longer than 10 seconds.
   */
  const [committing, setCommitting] = React.useState<Set<string>>(new Set());
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /**
   * Ticks while anything is undoable, so the bar can COUNT DOWN. The window was
   * always 10s; with no number on screen there was no way to see that, and a
   * wait you cannot measure always feels longer than it is.
   */
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    if (pendingDeletes.length === 0) return;
    // Read the clock in a CALLBACK, never in render — render must stay pure,
    // and a setState in the effect body would cascade a render on every mount.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [pendingDeletes.length]);

  /**
   * Whole seconds left on a row's undo window. Clamped to the window at both
   * ends so the first paint — before the effect has read the clock — shows a
   * full 10 rather than a number derived from an unset `now`.
   */
  const secondsLeft = (at: number) =>
    Math.min(UNDO_WINDOW_MS / 1000, Math.max(0, Math.ceil((UNDO_WINDOW_MS - (now - at)) / 1000)));
  const pendingIds = new Set([...pendingDeletes.map((p) => p.row.id), ...committing]);

  /**
   * Leaving with a countdown still running COMMITS it: the user pressed Delete
   * and did not take it back, so the deletion must not be lost to a navigation.
   */
  React.useEffect(() => {
    const running = timers.current;
    return () => {
      running.forEach((timer, id) => {
        clearTimeout(timer);
        // Not undone, so it stands: finish the deletion rather than lose it.
        void removeAccessActivity(id);
      });
      running.clear();
    };
  }, []);

  const current = hhAccessRole(role);
  // Section is its own question — the module never rewrites it.
  const sectionTabs = HH_ACCESS_SECTIONS;
  const actionOptions = hhActionsFor(role);

  // Employees and Interns draw from their own rosters; other modules have no
  // roster of their own, so they fall back to the employee list.
  const nameOptions = hhNamesFor(section === "interns" ? "intern" : "employee").map((n) => ({ code: n, label: n }));

  /**
   * MODAL ONLY. An overlay freezes the page behind it and answers Escape; a
   * PAGE must do neither — the scroll lock left the Admin Panel unscrollable,
   * with Save stranded below the fold, and Escape would have navigated away
   * mid-entry.
   */
  React.useEffect(() => {
    if (variant === "page") return;
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
  }, [onClose, variant]);

  function pickRole(next: string) {
    setRole(next);
    setError(null);
    // Admin's actions are a superset, so switching down can strand a selection
    // the new role cannot hold.
    if (action && !hhActionsFor(next).some((a) => a.code === action)) setAction("");
  }

  function toggleModule(code: string) {
    // Only the module set changes. Section, and the person under it, stand.
    setModules((m) => (m.includes(code) ? m.filter((c) => c !== code) : [...m, code]));
  }

  const complete = Boolean(modules.length > 0 && section && personName && action);

  /**
   * The rows the form currently describes — one per selected module — or an
   * empty list while it is incomplete.
   */
  function draftRows(): StagedRow[] {
    if (!complete) return [];
    return modules.map((code, i) => ({
      key: `${personName}-${action}-${code}-${i}`,
      role,
      module: code,
      section,
      personName,
      action,
      description: description.trim() || null,
    }));
  }

  function save() {
    // Save is the ONLY writer: it stores exactly what the form describes, one
    // row per selected module. There is no staging step to forget to press.
    const rows = draftRows();
    if (rows.length === 0) {
      setError("Fill in the fields above, then Save.");
      return;
    }
    setError(null);
    startTransition(async () => {
      // Only what the action takes; the server stamps the timestamp itself.
      const res = await addAccessActivity(
        rows.map((r) => ({
          role: r.role,
          module: r.module,
          section: r.section,
          personName: r.personName,
          action: r.action,
          description: r.description,
        })),
      );
      if (res.ok) {
        // Clear the form too: these rows are stored now, and leaving the fields
        // filled invites a second, accidental Save of the same grant.
        setPersonName("");
        setDescription("");
        // As a MODAL, saving is the end of the errand, so it closes. As the
        // Admin Panel's own page there is nowhere to close to — staying put is
        // what lets the new row be seen arriving in Access Activity below.
        if (variant !== "page") onClose();
      } else setError(res.error);
    });
  }

  /**
   * Delete with a ten-second grace period.
   *
   * The row disappears immediately but the SERVER IS NOT TOLD until the
   * countdown ends, so Undo restores the entry to exactly its previous state —
   * same id, same timestamp — because nothing was deleted. Committing first and
   * re-creating on Undo would hand back a different row wearing the same name.
   */
  function removeStored(row: AccessActivity) {
    setError(null);
    // Seed the clock from the same reading the window is measured from, so the
    // bar opens at a full 10s rather than waiting for the interval's first tick.
    // This is a CLICK HANDLER, not render — a timed undo has to read the clock
    // somewhere, and this is the moment it starts from.
    // eslint-disable-next-line react-hooks/purity
    const at = Date.now();
    setNow(at);
    setPending((list) => [...list.filter((p) => p.row.id !== row.id), { row, at }]);
    const timer = setTimeout(() => {
      timers.current.delete(row.id);
      // Out of the undo list and into the in-flight set in the same beat, so
      // the row never comes back on screen between the two.
      setCommitting((c) => new Set(c).add(row.id));
      setPending((list) => list.filter((p) => p.row.id !== row.id));
      void commitDelete(row.id);
    }, UNDO_WINDOW_MS);
    timers.current.set(row.id, timer);
  }

  async function commitDelete(id: string) {
    const res = await removeAccessActivity(id);
    if (!res.ok) {
      setError(res.error);
      // It is still there, so stop hiding it — pretending otherwise would show
      // a row as gone that the next reload brings back.
      setCommitting((c) => {
        const next = new Set(c);
        next.delete(id);
        return next;
      });
    }
    // On success the row leaves `activity` at the next revalidate; it stays in
    // `committing` until then, which is exactly what keeps it off screen.
  }

  /** Change one stored row in place — a dropdown, or its description. */
  function editRow(id: string, patch: Parameters<typeof updateAccessActivity>[1]) {
    setError(null);
    startTransition(async () => {
      const res = await updateAccessActivity(id, patch);
      if (!res.ok) setError(res.error);
    });
  }

  function undoDelete(id: string) {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setPending((list) => list.filter((p) => p.row.id !== id));
  }

  // Stored rows only, minus any whose delete is counting down — they are gone
  // from the table the instant Delete is pressed, and come back on Undo.
  const rows = activity.filter((r) => !pendingIds.has(r.id)).map((r) => ({ ...r, key: r.id }));

  const onPage = variant === "page";

  const body = (
      <div
        role={onPage ? undefined : "dialog"}
        aria-modal={onPage ? undefined : true}
        aria-label="Access / Permissions"
        className={
          onPage
            ? "w-full rounded-[22px] bg-surface-card p-6 max-md:p-4"
            : "wg-rise mt-[5vh] w-full max-w-[1280px] rounded-[22px] bg-surface-card p-6 max-md:p-4"
        }
        style={{
          boxShadow: onPage
            ? "inset 0 0 0 1px var(--color-hairline)"
            : "inset 0 0 0 1px var(--color-hairline), 0 30px 70px -30px rgba(15,23,42,0.45)",
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-extrabold text-ink-strong">Access / Permissions</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        {/* Admin | HR | Ruchita */}
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1" role="tablist" aria-label="Role">
          {HH_ACCESS_ROLES.map((r) => {
            const on = role === r.code;
            const Icon = r.code === "admin" ? Crown : User;
            return (
              <button
                key={r.code}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pickRole(r.code)}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[15px] font-extrabold tracking-tight transition-colors"
                style={
                  on
                    ? {
                        background: `color-mix(in srgb, ${ORANGE} 9%, white)`,
                        color: ORANGE_DEEP,
                        boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${ORANGE} 50%, transparent)`,
                      }
                    : { color: "var(--color-ink-strong)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
                }
              >
                <Icon size={17} strokeWidth={2.4} />
                {r.label}
              </button>
            );
          })}
        </div>

        {/* The rule for the selected role, in its own words. */}
        <div
          className="mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3.5"
          style={{
            background: `color-mix(in srgb, ${ORANGE} 6%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 26%, transparent)`,
          }}
        >
          <Info size={17} strokeWidth={2.4} className="mt-px shrink-0" style={{ color: ORANGE }} />
          <p className="text-[14px] font-bold" style={{ color: ORANGE }}>
            {current.note}
          </p>
        </div>

        {/* Module · Section · Select · Action */}
        <div className="mt-5 grid grid-cols-4 gap-x-4 gap-y-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          {/* Multi-select as toggles rather than a <select multiple>, matching
              the Ambassadors screen: a handful of options, and ctrl-click is
              not a thing anyone should need. */}
          <div className="block">
            <span className={labelCls}>
              Module<span style={{ color: RED }}> *</span>
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Module">
              {HH_ACCESS_MODULES.map((m) => {
                const on = modules.includes(m.code);
                return (
                  <button
                    key={m.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleModule(m.code)}
                    className="rounded-pill px-3.5 py-2 text-[13px] font-bold transition-colors"
                    style={
                      on
                        ? { background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`, color: "#fff" }
                        : {
                            color: "var(--color-ink-soft)",
                            boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                          }
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section is a pair of tabs here, not a dropdown. */}
          <div className="block">
            <span className={labelCls}>
              Section<span style={{ color: RED }}> *</span>
            </span>
            <div
              className="inline-flex w-full rounded-xl p-1"
              role="tablist"
              aria-label="Section"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
            >
              {sectionTabs.map((sec) => {
                const on = section === sec.code;
                return (
                  <button
                    key={sec.code}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setSection(sec.code);
                      setPersonName("");
                    }}
                    className="flex-1 rounded-lg px-3 py-1.5 text-[13.5px] font-bold transition-colors"
                    style={
                      on
                        ? {
                            background: `color-mix(in srgb, ${ORANGE} 12%, white)`,
                            color: ORANGE_DEEP,
                            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 45%, transparent)`,
                          }
                        : { color: "var(--color-ink-strong)" }
                    }
                  >
                    {/* "App Development (Interns)" is just "Interns" at this width. */}
                    {sec.code === "interns" ? "Interns" : sec.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className={labelCls}>
              Select<span style={{ color: RED }}> *</span>
            </span>
            <Select
              value={personName}
              onChange={setPersonName}
              ariaLabel={section === "interns" ? "Select intern" : "Select employee"}
              placeholder={section === "interns" ? "Select intern" : "Select employee"}
              options={nameOptions}
            />
          </label>

          <label className="block">
            <span className={labelCls}>
              Action<span style={{ color: RED }}> *</span>
            </span>
            {/* Only what this role may hold: Admin all four, HR and Ruchita two. */}
            <Select
              value={action}
              onChange={setAction}
              ariaLabel="Action"
              placeholder="Select action"
              options={actionOptions}
            />
          </label>

        </div>

        <label className="mt-4 block">
          <span className={labelCls}>Description</span>
          <span className="relative block">
            <textarea
              className={`${inputCls} min-h-[76px] resize-y pr-44`}
              value={description}
              maxLength={DESCRIPTION_MAX}
              placeholder="Enter description"
              aria-label="Description"
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <VoiceNoteButton
                label="Dictate / Voice note"
                onText={(t) => setDescription((d) => (d ? d.trimEnd() + " " : "") + t)}
              />
            </span>
          </span>
        </label>

        <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[16px] font-extrabold" style={{ color: ORANGE }}>
            Access Activity
          </h3>
          {/* Right-aligned so they land over the table's last column, Manage. */}
          {onPage && (
            <div className="flex flex-wrap items-center gap-3">
              {BULK_ADD.map((b) => (
                <button
                  key={b.section}
                  type="button"
                  onClick={() => onBulkAdd?.(b.section)}
                  className="wg-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white"
                  style={{ background: RED }}
                >
                  <UserRoundPlus size={17} strokeWidth={2.4} />
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* One line per pending delete, each with its own ten-second Undo. The
            row is already out of the table; this is the only way back. */}
        {pendingDeletes.map((p) => (
          <div
            key={p.row.id}
            role="status"
            className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5"
            style={{
              background: `color-mix(in srgb, ${ORANGE} 7%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 28%, transparent)`,
            }}
          >
            <span className="text-[13px] font-bold" style={{ color: ORANGE_DEEP }}>
              Deleted “{p.row.personName}”. Undoable for {secondsLeft(p.at)}s.
            </span>
            <button
              type="button"
              onClick={() => undoDelete(p.row.id)}
              className="wg-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-bold"
              style={{
                color: ORANGE_DEEP,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 45%, transparent)`,
              }}
            >
              <Undo2 size={14} strokeWidth={2.6} /> Undo
            </button>
          </div>
        ))}

        <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr
                className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle"
                style={{ background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)" }}
              >
                <th className="w-[170px] px-4 py-3">Module</th>
                <th className="w-[170px] px-4 py-3">Name</th>
                <th className="w-[150px] px-4 py-3">Section</th>
                <th className="w-[130px] px-4 py-3">Action</th>
                <th className="px-4 py-3">Description</th>
                <th className="w-[110px] px-4 py-3">Time</th>
                <th className="w-[100px] px-4 py-3">Manage</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t border-hairline">
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-ink-subtle">
                    No access activity yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const pill = ACTION_PAST[r.action] ?? ACTION_PAST.view!;
                  const sectionLabel = hhAccessSectionLabel(r.section);
                  return (
                    <tr key={r.key} className="border-t border-hairline">
                      {/* Every stored row is EDITABLE in place: the same lists
                          the form offers, so a mistake is corrected where it is
                          seen rather than deleted and re-entered. */}
                      <td className="px-4 py-3">
                        <RowSelect
                          value={r.module}
                          disabled={!canEdit || pending}
                          ariaLabel={`Module for ${r.personName}`}
                          options={HH_ACCESS_MODULES.map((m) => ({ code: m.code, label: m.label }))}
                          onChange={(v) => editRow(r.id, { module: v })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RowSelect
                          value={r.personName}
                          disabled={!canEdit || pending}
                          ariaLabel={`Person for row ${r.key}`}
                          options={hhNamesFor(r.section === "interns" ? "intern" : "employee").map((n) => ({
                            code: n,
                            label: n,
                          }))}
                          extra={r.personName}
                          onChange={(v) => editRow(r.id, { personName: v })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RowSelect
                          value={r.section}
                          disabled={!canEdit || pending}
                          ariaLabel={`Section for ${r.personName}`}
                          options={HH_ACCESS_SECTIONS.map((x) => ({
                            code: x.code,
                            label: x.code === "interns" ? "Interns" : x.label,
                          }))}
                          onChange={(v) => editRow(r.id, { section: v })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RowSelect
                          value={r.action}
                          disabled={!canEdit || pending}
                          ariaLabel={`Action for ${r.personName}`}
                          options={hhActionsFor(r.role).map((a) => ({ code: a.code, label: a.label }))}
                          extra={r.action}
                          onChange={(v) => editRow(r.id, { action: v })}
                        />
                      </td>
                      {/* Description is typed, and saved when the field is left. */}
                      <td className="px-4 py-3">
                        <RowDescription
                          value={r.description ?? ""}
                          disabled={!canEdit || pending}
                          label={`Description for ${r.personName}`}
                          onCommit={(text) => editRow(r.id, { description: text })}
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-soft">
                        {r.occurredAt ? formatTime(r.occurredAt) : "—"}
                      </td>
                      {/* Delete is the only thing this column does. */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-label={`Delete ${r.personName}`}
                          disabled={!canEdit || pending}
                          onClick={() =>
                            removeStored(r)
                          }
                          className="rounded-lg p-2 transition-colors hover:bg-black/5 disabled:opacity-40"
                          style={{
                            color: RED,
                            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 35%, transparent)`,
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          className="mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3.5"
          style={{
            background: "color-mix(in srgb, #2563eb 5%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, #2563eb 20%, transparent)",
          }}
        >
          <Info size={17} strokeWidth={2.4} className="mt-px shrink-0" style={{ color: "#2563eb" }} />
          <div className="text-[13.5px] font-semibold" style={{ color: "#2563eb" }}>
            {current.summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold" style={{ color: RED }}>
            {error}
          </p>
        )}
        {!canEdit && (
          <p className="mt-3 text-[12.5px] font-semibold text-ink-subtle">
            Only Admin or Ruchita can change access. You can read the activity above.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="wg-btn rounded-xl px-8 py-2.5 text-[14px] font-bold"
            style={{
              background: "var(--color-surface-card)",
              color: "var(--color-ink-strong)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !canEdit}
            className="wg-btn rounded-xl px-10 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
          >
            Save
          </button>
        </div>
      </div>
  );

  // Inline on the Admin Panel; portalled over the page everywhere else, so the
  // modal keeps its backdrop and its escape-from-stacking-contexts behaviour.
  if (onPage) return body;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-6 max-md:p-3"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {body}
    </div>,
    document.body,
  );
}
