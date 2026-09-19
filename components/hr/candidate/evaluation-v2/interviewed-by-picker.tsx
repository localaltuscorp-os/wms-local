"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Users2, X } from "lucide-react";
import { listInterviewerNames } from "@/app/(app)/hr/candidate-actions";

/**
 * INTERVIEWED BY — who actually sat in the interview, on the Recommendation card.
 *
 * ── NAMES, NOT IDS ────────────────────────────────────────────────────────
 * The selection is stored as the employees' NAMES. An evaluation is a record
 * of what happened on a date: if someone leaves and their row is deactivated,
 * or the roster is renamed, the panel on that interview must still read the way
 * it was signed. Ids would leave an old evaluation showing blanks - or worse,
 * a different person - the moment the roster moved under it.
 *
 * ── THE ROSTER IS FETCHED ON FIRST OPEN, NOT PASSED IN ────────────────────
 * The alternative was threading the employee list from the page through the
 * screen, the section switch and the card - four hops of props - and shipping
 * the whole roster in the RSC payload of every evaluation page view, opened or
 * not. One action on first open costs nothing until somebody actually picks.
 *
 * A name already stored is shown as a chip even if it is not in the roster any
 * more, so a past evaluation never silently loses an interviewer.
 */
export function InterviewedByPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (names: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [roster, setRoster] = React.useState<string[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [q, setQ] = React.useState("");
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Load once, from the CLICK — not from an effect keyed on `open`.
   *
   * Opening is a user event, so the fetch belongs in the handler: an effect
   * that setStates on mount-of-open is a cascading render, and React's lint
   * rightly calls it out. Re-clicking is cheap because `roster !== null` is the
   * guard.
   */
  function openAndLoad() {
    setOpen((o) => !o);
    if (roster !== null || loading) return;
    setLoading(true);
    void listInterviewerNames()
      .then((res) => setRoster(res.ok ? res.names : []))
      .finally(() => setLoading(false));
  }

  // Click-away. A dropdown that only closes via its own button is one the
  // reader has to notice and dismiss before they can use the card behind it.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = new Set(value);

  /** Roster plus any stored name the roster no longer has. */
  const options = React.useMemo(() => {
    const all = [...(roster ?? []), ...value.filter((n) => !(roster ?? []).includes(n))];
    const seen = new Set<string>();
    const uniq = all.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
    const needle = q.trim().toLowerCase();
    return needle ? uniq.filter((n) => n.toLowerCase().includes(needle)) : uniq;
  }, [roster, value, q]);

  function toggle(name: string) {
    onChange(selected.has(name) ? value.filter((n) => n !== name) : [...value, name]);
  }

  return (
    <div ref={boxRef} className="relative ml-auto">
      <button
        type="button"
        onClick={openAndLoad}
        aria-expanded={open}
        className="inline-flex h-9 max-w-[320px] items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 text-[12.5px] font-bold text-ink-strong"
      >
        <Users2 size={14} strokeWidth={2.3} className="shrink-0 text-ink-subtle" />
        <span className="truncate">
          {value.length === 0
            ? "Interviewed By"
            : value.length <= 2
              ? value.join(", ")
              : `${value[0]} +${value.length - 1}`}
        </span>
        <ChevronDown size={14} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-1.5 w-[280px] rounded-xl border border-hairline-strong bg-white p-2 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)]">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              className="h-8 min-w-0 flex-1 rounded-lg border border-hairline-strong px-2.5 text-[12.5px] text-ink-strong outline-none focus:border-altus-red"
            />
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-altus-red"
              >
                <X size={12} strokeWidth={2.6} /> Clear
              </button>
            )}
          </div>

          <div className="max-h-[260px] overflow-y-auto">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-3 text-[12.5px] text-ink-muted">
                <Loader2 size={13} className="animate-spin" /> Loading people…
              </p>
            ) : options.length === 0 ? (
              <p className="px-2 py-3 text-[12.5px] text-ink-muted">
                {q.trim() ? "No match." : "No people to choose from."}
              </p>
            ) : (
              options.map((name) => {
                const on = selected.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggle(name)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-soft"
                  >
                    <span
                      className="grid h-4 w-4 shrink-0 place-items-center rounded border"
                      style={
                        on
                          ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)", color: "#fff" }
                          : { borderColor: "var(--color-hairline-strong)" }
                      }
                    >
                      {on && <Check size={11} strokeWidth={3.4} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink-strong">{name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
