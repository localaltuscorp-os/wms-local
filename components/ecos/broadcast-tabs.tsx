"use client";

import Link from "next/link";
import type { Route } from "next";
import { Inbox, Send, Archive, Plus, BarChart3 } from "lucide-react";

/**
 * The Broadcasts tab strip — and the module's real header.
 *
 * It replaces a header whose entire content was a "New Broadcast" button
 * duplicating the one in the empty state directly below it. Everything that
 * strip used to cost in vertical space now carries something: where you are
 * (Inbox / Sent / Archived, with counts), the way to the dashboard, and the one
 * compose button.
 *
 * Tabs are LINKS with `?tab=`, not local state, so the view survives a refresh,
 * is shareable, and lets each tab be a plain server render.
 */

export type BroadcastTab = "inbox" | "sent" | "archived";

const TABS: Array<{ id: BroadcastTab; label: string; Icon: typeof Inbox }> = [
  { id: "inbox", label: "My inbox", Icon: Inbox },
  { id: "sent", label: "Sent", Icon: Send },
  { id: "archived", label: "Archived", Icon: Archive },
];

export function BroadcastTabs({
  active,
  counts,
  unread,
}: {
  active: BroadcastTab;
  counts: Record<BroadcastTab, number>;
  unread: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <nav className="flex items-center gap-1 rounded-pill border border-hairline bg-surface-card p-1" aria-label="Broadcast views">
        {TABS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <Link
              key={id}
              href={(id === "inbox" ? "/communications" : `/communications?tab=${id}`) as Route}
              aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-[13px] font-bold transition ${
                on ? "text-white" : "text-ink-muted hover:text-ink-strong"
              }`}
              style={
                on
                  ? { background: "linear-gradient(135deg, #E10600, #A80400)" }
                  : undefined
              }
            >
              <Icon size={14} strokeWidth={2.5} />
              {label}
              {counts[id] > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[11px] font-black tabular-nums"
                  style={{
                    background: on ? "rgba(255,255,255,0.22)" : "var(--color-surface-muted, #f1f5f9)",
                    color: on ? "#fff" : "var(--color-ink-soft, #64748b)",
                  }}
                >
                  {counts[id]}
                </span>
              )}
              {/* The unread badge only ever belongs on the inbox tab. */}
              {id === "inbox" && unread > 0 && !on && (
                <span
                  aria-label={`${unread} unread`}
                  className="size-1.5 rounded-full"
                  style={{ background: "#E10600" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href={"/communications/dashboard" as Route}
          className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-strong transition hover:border-hairline-strong"
        >
          <BarChart3 size={14} strokeWidth={2.5} /> Dashboard
        </Link>
        <Link
          href={"/communications/compose" as Route}
          className="group inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, #E10600, #A80400)",
            boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
          }}
        >
          <Plus size={15} strokeWidth={2.8} className="transition-transform group-hover:rotate-90" />
          New Broadcast
        </Link>
      </div>
    </div>
  );
}
