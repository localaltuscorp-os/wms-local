"use client";

import * as React from "react";
import { Search, Check, Clock, ShieldCheck, MoonStar } from "lucide-react";
import { Pill } from "@/components/ecos/pills";
import { RECEIPT_STATUS_LABELS, RECEIPT_STATUS_TONE } from "@/lib/ecos/labels";
import type { BroadcastRecipientStatus } from "@/db/enums";

/**
 * WHO HAS READ THIS — the per-recipient table.
 *
 * The analytics panel used to list only the people who had NOT opened the
 * message. That answers "who do I chase" and nothing else: it could not tell
 * you when someone read it, whether they acknowledged it, which channels
 * actually reached them, or that a person had closed the popup four times
 * without reading a word. This is the whole roster, filterable, with the
 * timestamps — the sender's actual answer to "did this land?".
 *
 * Client-side filtering: a broadcast's audience is at most the company roster,
 * which is small enough that a round trip per keystroke would be slower and
 * worse than filtering an array that is already on the page.
 */

export interface RecipientRow {
  employeeId: string;
  name: string;
  email: string;
  department: string | null;
  status: BroadcastRecipientStatus;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  deliveredChannels: string[];
  snoozeCount: number;
}

type Filter = "all" | "pending" | "read" | "acknowledged";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "pending", label: "Unread" },
  { id: "read", label: "Read" },
  { id: "acknowledged", label: "Acknowledged" },
];

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "App",
  email: "Email",
  push: "Push",
  whatsapp_manual: "WhatsApp",
};

export function RecipientTable({ rows }: { rows: RecipientRow[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const c = { all: rows.length, pending: 0, read: 0, acknowledged: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ink-strong">Who has read this</h2>
        <label className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person…"
            aria-label="Filter recipients"
            className="w-[200px] rounded-xl border border-hairline bg-white py-2 pl-8 pr-3 text-[13px] font-medium text-ink-strong outline-none transition focus:border-[color:var(--color-altus-red)]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              className={`rounded-pill px-3 py-1.5 text-[12.5px] font-bold transition ${
                on
                  ? "text-white"
                  : "border border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink-strong"
              }`}
              style={on ? { background: "linear-gradient(135deg, #E10600, #A80400)" } : undefined}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[f.id]}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-[13.5px] font-medium text-ink-muted">
          Nobody matches that.
        </p>
      ) : (
        <div className="mt-3 max-h-[460px] overflow-auto rounded-xl border border-hairline">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">Reached by</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.employeeId} className="border-t border-hairline align-middle">
                  <td className="px-3 py-2">
                    <div className="truncate font-semibold text-ink-strong" title={r.name}>
                      {r.name}
                    </div>
                    <div className="truncate text-[11.5px] text-ink-soft" title={r.email}>
                      {r.department ?? r.email}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={RECEIPT_STATUS_TONE[r.status]}>
                      {r.status === "acknowledged" ? (
                        <ShieldCheck size={11} strokeWidth={2.6} />
                      ) : r.status === "read" ? (
                        <Check size={11} strokeWidth={3} />
                      ) : (
                        <Clock size={11} strokeWidth={2.6} />
                      )}
                      {RECEIPT_STATUS_LABELS[r.status]}
                    </Pill>
                    {/* A snooze count on an UNREAD row is the useful signal:
                        they saw the popup and closed it, repeatedly. */}
                    {r.snoozeCount > 0 && r.status === "pending" && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-700"
                        title={`Closed the popup ${r.snoozeCount} time${r.snoozeCount === 1 ? "" : "s"}`}
                      >
                        <MoonStar size={11} strokeWidth={2.6} />×{r.snoozeCount}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-muted">
                    {r.acknowledgedAt ?? r.readAt
                      ? new Date((r.acknowledgedAt ?? r.readAt)!).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {r.deliveredChannels.length === 0
                      ? "—"
                      : r.deliveredChannels.map((c) => CHANNEL_LABELS[c] ?? c).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
