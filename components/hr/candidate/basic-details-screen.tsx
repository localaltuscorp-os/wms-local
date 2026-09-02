"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { UserPlus, ClipboardList, Phone, Mail, Search, PenLine, PlayCircle, ClipboardCheck, Trash2, Loader2 } from "lucide-react";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import { deleteCandidateIntake } from "@/app/(app)/hr/candidate-actions";
import { CreateCandidateLogin } from "@/components/hr/candidate/create-candidate-login";
import { fireToast } from "@/lib/toast";

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

const SELECT_CLS =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red";

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
    if (!window.confirm(`Delete ${c.fullName || "this candidate"}? This wipes their entire record — form, checklist and evaluation. This cannot be undone.`)) return;
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-[320px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — candidates" title="Local search — filters only the list on this page" aria-label="Local search — candidates — this page only"
            className="w-full rounded-lg border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[14px] text-ink-strong outline-none focus:border-altus-red"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
        <div className="flex items-center gap-2">
          <CreateCandidateLogin />
          <Link
            href={"/hr/intake?new=1" as Route}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
          >
            <UserPlus size={16} strokeWidth={2.4} /> New candidate
          </Link>
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
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3 max-md:hidden">Position</th>
                <th className="px-4 py-3 max-md:hidden">Contact</th>
                <th className="px-4 py-3">Form</th>
                <th className="px-4 py-3 max-md:hidden">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const tone = STATUS_TONE[c.status] ?? { bg: "var(--color-surface-soft)", fg: "#64748b" };
                return (
                  <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <span className="text-[14px] font-bold text-ink-strong">{c.fullName || "Unnamed"}</span>
                    </td>
                    <td className="px-4 py-3 text-[13.5px] text-ink-muted max-md:hidden">{c.positionApplied || "—"}</td>
                    <td className="px-4 py-3 text-[12.5px] text-ink-muted max-md:hidden">
                      <div className="flex flex-col gap-0.5">
                        {c.mobile && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.mobile}</span>}
                        {c.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} /> {c.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.submitted ? (
                        <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 18%, white)", color: "#166534" }}>Complete</span>
                      ) : (
                        <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, #f59e0b 18%, white)", color: "#b45309" }}>Draft · {c.pct}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-md:hidden">
                      <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold capitalize" style={{ background: tone.bg, color: tone.fg }}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/hr/candidates/${c.id}/evaluation` as Route}
                          title="Evaluation Checklist Record"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
                        >
                          <ClipboardCheck size={13} style={{ color: RED }} /> <span className="max-md:hidden">Evaluation Record</span>
                        </Link>
                        <Link
                          href={`/hr/intake?draft=${c.id}` as Route}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
                        >
                          {c.submitted ? <><PenLine size={13} /> Edit</> : <><PlayCircle size={13} style={{ color: RED }} /> Resume</>}
                        </Link>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(c)}
                            disabled={busyId === c.id}
                            title="Delete candidate (wipes their whole record)"
                            aria-label={`Delete ${c.fullName || "candidate"}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-muted transition-colors hover:border-[color:var(--color-altus-red)] hover:text-[color:var(--color-altus-red)] disabled:opacity-50"
                          >
                            {busyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
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
