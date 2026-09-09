"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { UserPlus, ClipboardList, Phone, Mail, Search, PenLine, PlayCircle, ClipboardCheck, Trash2, Loader2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import { deleteCandidateIntake } from "@/app/(app)/hr/candidate-actions";
import { CreateCandidateLogin } from "@/components/hr/candidate/create-candidate-login";
import { fireToast } from "@/lib/toast";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";

/** The candidate's intake photo, falling back to their initials. Kept small and
 *  local — this is the only table that shows it. */
function CandidatePhoto({ name, src }: { name: string; src: string | null }) {
  const initials =
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  if (!src) {
    return (
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-soft text-[11px] font-bold text-ink-muted"
      >
        {initials}
      </span>
    );
  }
  return (
    // A plain <img>, not next/image: the src is a short-lived SIGNED storage
    // URL on a host the image optimiser is not configured for, and optimising
    // a 36px avatar buys nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-9 shrink-0 rounded-full object-cover"
    />
  );
}

/**
 * Candidate Records — the searchable list of every filled interview form. The
 * FORM itself lives on its own plain page (/hr/intake); "New candidate" jumps
 * there. Deliberately light (no wizard/motion import) so this list compiles fast.
 */
const RED = "var(--color-altus-red)";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  new: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)" },
  shortlisted: { bg: "color-mix(in srgb, var(--color-green) 16%, white)", fg: "#15803d" },
  rejected: { bg: "var(--color-surface-soft)", fg: "#64748b" },
  hired: { bg: "color-mix(in srgb, var(--color-green) 22%, white)", fg: "#166534" },
};

/* ONE SHAPE FOR THE WHOLE STRIP. The three controls used to disagree: the
 * selects were h-10/rounded-lg, "New candidate" was rounded-xl px-4 py-2.5 and
 * "Candidate login" rounded-xl px-4 py-2 - three heights and two radii in a row
 * that reads as one control group. Height and radius are now stated once here
 * and every control opts in, so they cannot drift apart again. */
const CONTROL_H = "h-10 shrink-0 rounded-lg";

const SELECT_CLS =
  `${CONTROL_H} border border-hairline-strong bg-white px-3 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red`;

const ACTION_CLS =
  `${CONTROL_H} inline-flex items-center gap-2 px-4 text-[13.5px] font-bold text-white transition-transform hover:-translate-y-0.5`;

export function BasicDetailsScreen({
  candidates,
  canDelete = false,
}: {
  candidates: CandidateRow[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [position, setPosition] = React.useState("all");
  const [form, setForm] = React.useState("all");
  const [deleted, setDeleted] = React.useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Distinct positions for the filter dropdown (from the loaded rows — no query).
  const positions = React.useMemo(
    () => Array.from(new Set(candidates.map((c) => c.positionApplied).filter((p): p is string => !!p))).sort(),
    [candidates],
  );

  const rows = candidates.filter((c) => {
    if (deleted.has(c.id)) return false;
    if (status !== "all" && c.status !== status) return false;
    if (position !== "all" && c.positionApplied !== position) return false;
    if (form === "complete" && !c.submitted) return false;
    if (form === "draft" && c.submitted) return false;
    if (q.trim()) {
      const s = `${c.fullName} ${c.positionApplied ?? ""} ${c.mobile ?? ""} ${c.email ?? ""}`.toLowerCase();
      if (!s.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  function onDelete(c: CandidateRow) {
    if (busyId) return;
    if (!window.confirm(`Delete ${c.fullName || "this candidate"}? This wipes their entire record - form, checklist and evaluation. This cannot be undone.`)) return;
    setBusyId(c.id);
    void deleteCandidateIntake(c.id)
      .then((r) => {
        if (r.ok) {
          setDeleted((prev) => new Set(prev).add(c.id));
          fireToast({ message: "Candidate deleted.", type: "success" });
          router.refresh();
        } else {
          fireToast({ message: r.error, type: "error" });
        }
      })
      .finally(() => setBusyId(null));
  }

  return (
    <>
      {/* FILTERS LEFT, ACTIONS + SEARCH RIGHT.
          `ml-auto` on the actions group is what pins everything after it to the
          right edge, so the filters keep the left and the gap between the two
          halves absorbs the width instead of a control stretching.
          The search rests as its magnifier and opens to a fixed 280px, which
          PUSHES the two buttons left rather than stretching anything - a
          `flex-1` field here would have eaten the `ml-auto` free space and left
          the buttons stranded mid-row. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLS} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="hired">Hired</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={form} onChange={(e) => setForm(e.target.value)} className={SELECT_CLS} aria-label="Filter by form state">
          <option value="all">All forms</option>
          <option value="complete">Complete</option>
          <option value="draft">Draft</option>
        </select>
        {positions.length > 0 && (
          <select value={position} onChange={(e) => setPosition(e.target.value)} className={SELECT_CLS} aria-label="Filter by position">
            <option value="all">All positions</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        {/* The child button is w-full, so the wrapper sets its width; the
            arbitrary variants give it the shared height and radius. */}
        <div className="ml-auto w-[176px] shrink-0 [&>button]:h-10 [&>button]:rounded-lg">
          <CreateCandidateLogin />
        </div>
        <Link
          href={"/hr/intake?new=1" as Route}
          className={ACTION_CLS}
          style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
        >
          <UserPlus size={16} strokeWidth={2.4} /> New candidate
        </Link>
        <CollapsibleSearch scope="candidates">
          <div className="relative w-[280px] max-w-[52vw]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Local search - candidates" title="Local search - filters only the list on this page" aria-label="Local search - candidates - this page only"
              className={`${CONTROL_H} w-full border border-hairline-strong bg-white pl-9 pr-3 text-[14px] text-ink-strong outline-none focus:border-altus-red`}
            />
          </div>
        </CollapsibleSearch>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-solid border-hairline-strong bg-surface-card px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: "var(--color-altus-red-deep)" }}>
            <ClipboardList size={26} strokeWidth={2.1} />
          </span>
          <h3 className="mt-4 text-[18px] font-bold text-ink-strong">{candidates.length === 0 ? "No candidates yet" : "No matches"}</h3>
          <p className="mt-1 max-w-[42ch] text-[13.5px] text-ink-muted">{candidates.length === 0 ? "Fill a candidate's interview form to see them here." : "Try a different search."}</p>
          {candidates.length === 0 && (
            <Link href={"/hr/intake?new=1" as Route} className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}>
              <UserPlus size={15} strokeWidth={2.4} /> Fill interview form
            </Link>
          )}
        </div>
      ) : (
        /* FULL WIDTH, like every other module. This was `mx-auto w-fit`, which
           shrink-wrapped the card to its content and left the page gutter
           uneven against the strip above it.
           
           THE OLD WARNING STILL APPLIES, AND IS HANDLED. Stretching the table
           means the leftover width has to land somewhere: it used to open as a
           gap mid-row in Contact, and before that pushed the row menu away from
           Status. The fix is to name ONE column as the one that absorbs slack -
           Contact carries `w-full` below, every other cell is nowrap - so the
           surplus goes somewhere chosen rather than wherever the layout
           algorithm felt like. The wrapper still scrolls on narrow screens
           rather than forcing the page to. */
        <div className="w-full overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                {/* The photo lives INSIDE the Candidate cell — they are one unit
                    identifying the person, so a separate column would have put
                    the "Candidate" header over the name only, offset from the
                    left edge of the thing it labels. The row menu stays
                    unlabelled: a header there would only name the obvious. */}
                <th className="whitespace-nowrap py-3 pl-4 pr-5">Candidate</th>
                <th className="whitespace-nowrap px-5 py-3 max-md:hidden">Position</th>
                {/* THE SLACK COLUMN - see the note above the table. */}
                <th className="w-full py-3 pl-5 pr-4 max-md:hidden">Contact</th>
                <th className="whitespace-nowrap py-3 pl-4 pr-5">Form</th>
                <th className="whitespace-nowrap py-3 pl-5 pr-2 max-md:hidden">Status</th>
                <th className="w-px py-3 pl-2 pr-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const tone = STATUS_TONE[c.status] ?? { bg: "var(--color-surface-soft)", fg: "#64748b" };
                return (
                  <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-surface-muted/50">
                    <td className="whitespace-nowrap py-3 pl-4 pr-5">
                      <span className="flex items-center gap-3.5">
                        <CandidatePhoto name={c.fullName} src={c.avatarUrl} />
                        <span className="text-[14px] font-bold text-ink-strong">{c.fullName || "Unnamed"}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[13.5px] text-ink-muted max-md:hidden">{c.positionApplied || "-"}</td>
                    <td className="py-3 pl-5 pr-4 text-[12.5px] text-ink-muted max-md:hidden">
                      <div className="flex flex-col gap-0.5">
                        {c.mobile && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.mobile}</span>}
                        {c.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} /> {c.email}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-4 pr-5">
                      {c.submitted ? (
                        <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 18%, white)", color: "#166534" }}>Complete</span>
                      ) : (
                        <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, #f59e0b 18%, white)", color: "#b45309" }}>Draft · {c.pct}%</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-5 pr-2 max-md:hidden">
                      <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold capitalize" style={{ background: tone.bg, color: tone.fg }}>{c.status}</span>
                    </td>
                    {/* One kebab instead of a row of buttons: the actions are
                        the same three every row, and a fixed-width menu button
                        cannot be knocked out of alignment by its own label the
                        way "Edit" vs "Resume" used to be. */}
                    <td className="w-px py-3 pl-2 pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions for ${c.fullName || "candidate"}`}
                            title="Actions"
                            disabled={busyId === c.id}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-muted transition-colors hover:border-ink-soft hover:text-ink disabled:opacity-50"
                          >
                            {busyId === c.id ? <Loader2 size={15} className="animate-spin" /> : <MoreVertical size={15} />}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem asChild>
                            <Link href={`/hr/candidates/${c.id}/evaluation` as Route}>
                              <ClipboardCheck size={14} style={{ color: RED }} /> Evaluation Record
                            </Link>
                          </DropdownMenuItem>
                          {/* Same destination either way — the intake form. The
                              wording follows the form state so the menu says what
                              opening it will actually do. */}
                          <DropdownMenuItem asChild>
                            <Link href={`/hr/intake?draft=${c.id}` as Route}>
                              {c.submitted ? (
                                <><PenLine size={14} style={{ color: RED }} /> Edit</>
                              ) : (
                                <><PlayCircle size={14} style={{ color: RED }} /> Resume</>
                              )}
                            </Link>
                          </DropdownMenuItem>
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem danger onSelect={() => onDelete(c)}>
                                <Trash2 size={14} /> Delete candidate
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
