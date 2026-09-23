"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { grantVisibility, revokeVisibility } from "@/app/(admin)/admin/access-control/actions";
import type { VisibilityDomain } from "@/lib/access/visibility";

/**
 * ACCESS CONTROL — the grants list and the form that writes it, for ONE domain.
 *
 * The page renders this twice (Tasks, Incentive) because the two modules share
 * one table, one rule and one screen: a second component for the second domain
 * would be the second access-control system the brief rules out.
 *
 * Both selects list ACTIVE employees; "Everyone in the organisation" is the
 * first option of the target select, because it is the grant people reach for,
 * and making it a separate checkbox would be a second control for one idea.
 *
 * The panel is deliberately plain: this is the screen that decides who can read
 * whose records, and it should read like a ledger rather than like a wizard.
 */

export interface GrantView {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string | null;
  targetId: string | null;
  targetName: string | null;
  note: string | null;
  grantedByName: string | null;
  createdAt: string;
}

export interface PersonOption {
  id: string;
  name: string;
}

/** What each domain is called, and what is being widened. */
const DOMAIN_COPY: Record<
  VisibilityDomain,
  { heading: string; verb: string; record: string; empty: string }
> = {
  tasks: {
    heading: "Task Visibility",
    verb: "see tasks of",
    record: "tasks",
    empty: "No grants. Everybody sees their own tasks and the people below them.",
  },
  incentive: {
    heading: "Incentive Visibility",
    verb: "see incentives of",
    record: "incentives",
    empty: "No grants. Everybody sees their own incentives and the people below them.",
  },
};

const field =
  "h-10 rounded-lg border border-hairline bg-surface-card px-3 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-hairline-strong";

export function AccessControlPanel({
  domain,
  grants,
  people,
  canGrant,
  viewerName,
}: {
  domain: VisibilityDomain;
  grants: GrantView[];
  people: PersonOption[];
  canGrant: boolean;
  viewerName: string;
}) {
  const router = useRouter();
  const copy = DOMAIN_COPY[domain];
  const [employeeId, setEmployeeId] = React.useState("");
  const [targetId, setTargetId] = React.useState("all");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("domain", domain);
    fd.set("employeeId", employeeId);
    fd.set("targetId", targetId);
    fd.set("note", note);
    const res = await grantVisibility(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const who = people.find((p) => p.id === employeeId)?.name ?? "They";
    const what =
      targetId === "all"
        ? "the whole organisation"
        : `${people.find((p) => p.id === targetId)?.name ?? "that person"} and their team`;
    fireToast({ message: `${who} can now see the ${copy.record} of ${what}.` });
    setEmployeeId("");
    setTargetId("all");
    setNote("");
    router.refresh();
  }

  async function revoke(grant: GrantView) {
    if (!window.confirm(`Remove ${grant.employeeName}'s access to ${describe(grant)}?`)) return;
    const res = await revokeVisibility(grant.id, domain);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: "Grant removed." });
    router.refresh();
  }

  const orgWide = grants.filter((g) => !g.targetId).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold text-ink-strong">{copy.heading}</h2>
        <span className="text-[12.5px] font-semibold text-ink-subtle">
          {grants.length} grant{grants.length === 1 ? "" : "s"}
          {orgWide > 0 ? ` · ${orgWide} organisation-wide` : ""}
        </span>
      </div>

      {canGrant && (
        <form
          onSubmit={submit}
          className="rounded-section border border-hairline bg-surface-card p-4"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} strokeWidth={2.4} className="text-ink-muted" />
            <h3 className="text-[15px] font-bold text-ink-strong">
              Let someone {copy.verb} more people
            </h3>
          </div>
          <p className="mt-1 text-[13px] text-ink-muted" style={{ maxWidth: "68ch" }}>
            Everyone sees their own {copy.record} and those of the people below them in the
            reporting tree. This widens that for one person — it is enforced on the server, so it
            applies to every screen that reads them at once.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                Person
              </span>
              <select
                className={field}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              >
                <option value="">Choose a person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                May see
              </span>
              <select className={field} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="all">Everyone in the organisation</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} and their team
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                Why (optional)
              </span>
              <input
                className={field}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. covering the Accounts team this quarter"
                maxLength={300}
              />
            </label>

            <button
              type="submit"
              disabled={busy || !employeeId}
              className="pastel-cta wg-btn inline-flex h-10 items-center gap-1.5 rounded-chip px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? "Saving…" : "Grant access"}
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md border px-3 py-2 text-[13.5px] font-semibold"
              style={{
                borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
                background: "var(--color-altus-red-wash)",
                color: "var(--color-altus-red-deep)",
              }}
            >
              {error}
            </p>
          )}
        </form>
      )}

      {!canGrant && (
        <p className="rounded-section border border-hairline bg-surface-soft p-4 text-[13.5px] font-semibold text-ink-soft">
          Only a master admin can change these grants. You can see them, signed in as{" "}
          {viewerName || "your account"}.
        </p>
      )}

      <div className="overflow-hidden rounded-section border border-hairline">
        <table className="w-full text-[13.5px]">
          <thead style={{ background: "var(--color-surface-soft)" }}>
            <tr className="text-left text-ink-subtle">
              <th className="px-4 py-3 font-bold">Person</th>
              <th className="px-4 py-3 font-bold">May see</th>
              <th className="px-4 py-3 font-bold">Note</th>
              <th className="px-4 py-3 font-bold">Granted</th>
              <th className="px-4 py-3 font-bold" />
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                  {copy.empty}
                </td>
              </tr>
            )}
            {grants.map((g) => (
              <tr key={g.id} className="border-t border-hairline">
                <td className="px-4 py-3">
                  <span className="font-semibold text-ink-strong">{g.employeeName}</span>
                  {g.employeeEmail && (
                    <span className="block text-[12px] text-ink-subtle">{g.employeeEmail}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-soft">{describe(g)}</td>
                <td className="px-4 py-3 text-ink-muted" style={{ maxWidth: 320 }}>
                  {g.note ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-subtle">
                  {new Date(g.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {g.grantedByName && (
                    <span className="block text-[12px]">by {g.grantedByName}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {canGrant && (
                    <button
                      type="button"
                      onClick={() => void revoke(g)}
                      className="inline-flex items-center gap-1 rounded-lg border border-hairline-strong px-2.5 py-1 text-[12px] font-semibold text-ink-muted hover:text-ink-strong"
                    >
                      <Trash2 size={13} strokeWidth={2.4} />
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function describe(g: GrantView): string {
  return g.targetId
    ? `${g.targetName ?? "That person"} and their team`
    : "Everyone in the organisation";
}
