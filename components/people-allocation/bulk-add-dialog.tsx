"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, UserRoundPlus, Check } from "lucide-react";
import { HH_EMPLOYEE_NAMES, HH_INTERN_NAMES, ALLOCATION_CATEGORIES } from "@/db/enums";
import { bulkAddParticipants } from "@/app/(app)/people-allocation/actions";

/**
 * BULK ADD — put many people onto one product in a single pass.
 *
 * Opened by the Admin Panel's "Bulk Add PS" / "Bulk Add BSS" buttons. The two
 * differ only in which product they write, so they share this one dialog.
 *
 * Rows are the rosters themselves, in two groups, because that is the list the
 * chooser is picking from. Anyone already on the product is shown as such and
 * cannot be picked again — running the same bulk add twice must be harmless.
 */

const RED = "var(--color-altus-red)";
const ACCENT = "#E10600";

interface Choice {
  name: string;
  kind: "employee" | "intern";
}

const ROSTER: Choice[] = [
  ...HH_EMPLOYEE_NAMES.map((name) => ({ name, kind: "employee" as const })),
  ...HH_INTERN_NAMES.map((name) => ({ name, kind: "intern" as const })),
];

const key = (c: Choice) => `${c.kind}:${c.name}`;

export function BulkAddDialog({
  section,
  alreadyOn,
  onClose,
  onDone,
}: {
  /** ps | bss — which product everyone selected lands on. */
  section: string;
  /** "kind:name" for people already on this product; they cannot be picked. */
  alreadyOn: Set<string>;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const product = ALLOCATION_CATEGORIES.find((c) => c.code === section);
  const label = product?.short ?? section.toUpperCase();

  const selectable = ROSTER.filter((c) => !alreadyOn.has(key(c)));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function toggle(c: Choice) {
    const k = key(c);
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function save() {
    const people = ROSTER.filter((c) => picked.has(key(c)));
    if (!people.length) {
      setError("Select at least one person.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkAddParticipants({ section, people });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const done = res.added + res.assigned;
      const parts = [`${done} added to ${label}`];
      if (res.skipped) parts.push(`${res.skipped} already there`);
      onDone(parts.join(" · "));
    });
  }

  const groups: { title: string; rows: Choice[] }[] = [
    { title: "Employees", rows: ROSTER.filter((c) => c.kind === "employee") },
    { title: "App Development (Interns)", rows: ROSTER.filter((c) => c.kind === "intern") },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-6 max-md:p-3"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bulk Add ${label}`}
        className="wg-rise mt-[6vh] w-full max-w-[720px] rounded-[22px] bg-surface-card p-6 max-md:p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 30px 70px -30px rgba(15,23,42,0.45)" }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-4">
          <h2 className="inline-flex items-center gap-2 text-[17px] font-extrabold text-ink-strong">
            <UserRoundPlus size={18} strokeWidth={2.4} style={{ color: RED }} />
            Bulk Add {label}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13.5px] text-ink-soft">
            Select everyone to add to <span className="font-bold text-ink-strong">{label}</span>.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPicked(new Set(selectable.map(key)))}
              className="text-[13px] font-bold"
              style={{ color: ACCENT }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-[13px] font-bold text-ink-subtle"
            >
              Clear
            </button>
          </div>
        </div>

        <div
          className="max-h-[46vh] overflow-y-auto rounded-xl p-1"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          {groups.map((g) => (
            <div key={g.title} className="p-2">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{g.title}</p>
              <div className="grid grid-cols-3 gap-1.5 max-md:grid-cols-2">
                {g.rows.map((c) => {
                  const k = key(c);
                  const on = picked.has(k);
                  const taken = alreadyOn.has(k);
                  return (
                    <label
                      key={k}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] ${
                        taken ? "opacity-50" : "cursor-pointer hover:bg-black/[0.03]"
                      }`}
                      style={on ? { background: `color-mix(in srgb, ${ACCENT} 9%, transparent)` } : undefined}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#E10600]"
                        checked={on}
                        disabled={taken || pending}
                        aria-label={c.name}
                        onChange={() => toggle(c)}
                      />
                      <span className="min-w-0 truncate font-semibold text-ink-strong">{c.name}</span>
                      {/* Already on this product — shown, not hidden, so the
                          list stays the roster you recognise. */}
                      {taken && <Check size={13} className="shrink-0 text-ink-subtle" />}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold" style={{ color: RED }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-ink-soft">{picked.size} selected</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="wg-btn rounded-xl px-6 py-2.5 text-[13.5px] font-bold"
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
              disabled={pending || picked.size === 0}
              className="wg-btn inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
              style={{ background: RED }}
            >
              <UserRoundPlus size={16} strokeWidth={2.4} />
              {pending ? "Adding…" : `Add ${picked.size || ""} to ${label}`.replace("  ", " ")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
