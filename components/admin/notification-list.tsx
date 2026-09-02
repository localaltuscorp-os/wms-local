"use client";

import { useState } from "react";
import { format } from "date-fns";
import type {
  Channel,
  ChannelStatus,
  NotificationRow,
} from "@/lib/queries/notifications";

const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  slack: "Slack",
  whatsapp: "WhatsApp",
  push: "Push",
};

const CHANNEL_ORDER: readonly Channel[] = ["email", "slack", "whatsapp", "push"];

const STATUS_GLYPH: Record<ChannelStatus, string> = {
  delivered: "✓",
  failed: "✗",
  not_attempted: "–",
};

/**
 * Per-channel chip styling.  Uses the project palette tokens via
 * `color-mix(in srgb, var(--color-X) N%, transparent)` (the same pattern
 * settings-form.tsx and tasks/audit-event.tsx use) rather than Tailwind's
 * `bg-green-500/10` opacity-modifier syntax, which the project's
 * `@theme inline` palette doesn't expose.
 */
const CHIP_STYLE: Record<ChannelStatus, React.CSSProperties> = {
  delivered: {
    background: "color-mix(in srgb, var(--color-green) 12%, transparent)",
    color: "var(--color-green-deep)",
    borderColor: "color-mix(in srgb, var(--color-green) 35%, transparent)",
  },
  failed: {
    background: "color-mix(in srgb, var(--color-red) 12%, transparent)",
    color: "var(--color-red-deep)",
    borderColor: "color-mix(in srgb, var(--color-red) 35%, transparent)",
  },
  not_attempted: {
    background: "color-mix(in srgb, var(--color-ink-subtle) 8%, transparent)",
    color: "var(--color-ink-subtle)",
    borderColor: "var(--color-hairline)",
  },
};

interface Props {
  rows: NotificationRow[];
  hasMore: boolean;
  /** Pre-computed URL to load older rows (`?before=<isoOldest>`).
      `null` when there is no next page. */
  loadOlderHref: string | null;
}

/**
 * Renders the admin notifications log: one row per notification, with a
 * 4-chip channel status block (email / slack / whatsapp / push) on the
 * right and an inline expand to reveal the full body + delivery audit.
 * Matches the Light Vibrant rhythm of `activity-list.tsx` (hairline
 * borders, 1px shadow, ink-subtle metadata line).
 */
export function NotificationList({ rows, hasMore, loadOlderHref }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div
        className="text-center py-16 rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p className="text-[15px] text-ink-subtle italic">
          No notifications match these filters.
        </p>
      </div>
    );
  }

  return (
    <ul
      className="divide-y divide-hairline rounded-section border border-hairline bg-surface-card overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {rows.map((n) => {
        const isOpen = expandedId === n.id;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : n.id)}
              aria-expanded={isOpen}
              className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-[rgba(15,23,42,0.015)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-body font-semibold text-ink-strong truncate">
                  {n.title}
                </div>
                <div className="text-[12.5px] text-ink-subtle truncate mt-0.5">
                  <span className="font-medium text-ink-soft">
                    {n.recipientName}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span>{n.kind.replace(/_/g, " ")}</span>
                  <span className="mx-1.5">·</span>
                  <span className="tabular-nums">
                    {format(n.createdAt, "MMM d, HH:mm")}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 shrink-0 justify-end max-w-[180px]">
                {CHANNEL_ORDER.map((ch) => {
                  const s = n.channelStatus[ch];
                  return (
                    <span
                      key={ch}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border"
                      style={CHIP_STYLE[s]}
                      title={`${CHANNEL_LABELS[ch]} — ${s.replace(/_/g, " ")}`}
                    >
                      <span aria-hidden>{STATUS_GLYPH[s]}</span>
                      {CHANNEL_LABELS[ch]}
                    </span>
                  );
                })}
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 -mt-1">
                {n.body && (
                  <p className="text-[14.5px] text-ink-soft whitespace-pre-line">
                    {n.body}
                  </p>
                )}
                <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 mt-3 text-[12.5px]">
                  <dt className="text-ink-subtle">Recipient email</dt>
                  <dd className="font-mono text-ink-strong">
                    {n.recipientEmail || "—"}
                  </dd>
                  <dt className="text-ink-subtle">Attempted</dt>
                  <dd className="text-ink-strong">
                    {n.attemptedChannels.length > 0
                      ? n.attemptedChannels.join(", ")
                      : "—"}
                  </dd>
                  <dt className="text-ink-subtle">Delivered</dt>
                  <dd className="text-ink-strong">
                    {n.deliveredChannels.length > 0
                      ? n.deliveredChannels.join(", ")
                      : "—"}
                  </dd>
                  {n.taskId && (
                    <>
                      <dt className="text-ink-subtle">Task</dt>
                      <dd className="font-mono text-ink-strong">{n.taskId}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}
          </li>
        );
      })}

      {hasMore && loadOlderHref && (
        <li className="text-center py-4">
          <a
            href={loadOlderHref}
            className="inline-flex items-center gap-1.5 text-altus-red text-chip font-semibold hover:underline"
          >
            Load older
            <span aria-hidden>→</span>
          </a>
        </li>
      )}
    </ul>
  );
}
