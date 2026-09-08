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

// Sized by their own text — the row they sit in is what the search bar above
// then matches, rather than the other way round.
const SELECT_CLS =
  "h-10 shrink-0 rounded-lg border border-hairline-strong bg-white px-3 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red";

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
    /* Full width, so the toolbar spans the page and grows with it as the
       sidebars open and close. The table below keeps its own `mx-auto w-fit`
       and stays centred and content-sized - only the controls stretch. */
    <div className="w-full">
      {/* One linear row: actions, then filters, then search. Every control is
          h-10, so the strip reads as a single line rather than the two stacked
          columns this used to be - that arrangement only existed to give the
          count tile something to sit level with, and it had to be padded to
          84px to manage it.

          The search is the ONLY flex-1 item, so it absorbs whatever width is
          left over - which is what makes the strip track the page as the
          sidebars open and close. min-w-[200px] stops it collapsing to nothing
          before the row is allowed to wrap. */}
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        {/* CreateCandidateLogin's button is `w-full` and takes no className, so
            its height is set here and inherited through the wrapper. */}
        <div className="w-[186px] shrink-0 [&>button]:h-10">
          <CreateCandidateLogin />
        </div>

        <Link
          href={"/hr/intake?new=1" as Route}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 text-[14px] font-bold text-ink-strong transition-colors hover:border-altus-red"
        >
          <UserPlus size={16} strokeWidth={2.4} /> New candidate
        </Link>

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

        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search - candidates" title="Local search - filters only the list on this page" aria-label="Local search - candidates - this page only"
            className="h-10 w-full rounded-lg border border-hairline-strong bg-white pl-9 pr-3 text-[14px] text-ink-strong outline-none focus:border-altus-red"
          />
        </div>
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
        /* The table sizes to its CONTENT, and the card to the table. Stretching
           it to the full page width meant the leftover had to go somewhere: it
           landed in Contact as a gap mid-row, and before that in the actions
           column, pushing the menu button away from Status. With no slack to
           distribute, neither happens. max-w-full keeps a wide table scrollable
           rather than overflowing the page. */
        <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
          <table className="text-left">
            <thead>
              <tr className="border-b border-hairline text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                {/* The photo lives INSIDE the Candidate cell — they are one unit
                    identifying the person, so a separate column would have put
                    the "Candidate" header over the name only, offset from the
                    left edge of the thing it labels. The row menu stays
                    unlabelled: a header there would only name the obvious. */}
                <th className="whitespace-nowrap py-3 pl-4 pr-5">Candidate</th>
                <th className="whitespace-nowrap px-5 py-3 max-md:hidden">Position</th>
                <th className="py-3 pl-5 pr-4 max-md:hidden">Contact</th>
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
    </div>
  );
}
