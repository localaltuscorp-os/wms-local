import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, XCircle, Loader2 } from "lucide-react";
import type { DispatchFailureRow } from "@/lib/queries/dispatch-log";

interface Props {
  rows: DispatchFailureRow[];
  totals: { sent: number; skipped: number; failed: number; failedTerminal: number };
}

/**
 * Phase 3.5-companion — surfaces what would otherwise be silent: each
 * (notification, channel) attempt that didn't land. Sits below the
 * per-channel Integration cards in /admin/settings.
 *
 * Pull-only — the retry cron handles re-runs on its own 5-minute
 * schedule. We show channel + recipient + error + attempt count +
 * next-retry-due for `failed` rows, and a redder badge for `failed_terminal`
 * (gave up after MAX_ATTEMPTS).
 */
export function RecentDispatchFailures({ rows, totals }: Props) {
  if (totals.sent + totals.skipped + totals.failed + totals.failedTerminal === 0) {
    // No dispatch attempts yet (fresh DB) — quiet empty state.
    return null;
  }

  return (
    <section className="mt-10 max-w-5xl">
      <header className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-display-xs">Recent dispatch failures</h3>
          <p className="text-body text-ink-subtle mt-1">
            Sends that didn't land. The retry cron picks `failed` rows up
            every 5 minutes; `terminal` rows have hit the 3-attempt cap and
            stopped retrying.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12.5px] font-semibold tabular-nums">
          <Stat label="sent" value={totals.sent} tone="green" />
          <Stat label="skipped" value={totals.skipped} tone="slate" />
          <Stat label="failed" value={totals.failed} tone="amber" />
          <Stat label="terminal" value={totals.failedTerminal} tone="red" />
        </div>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-5 py-8 text-center text-[14px] text-ink-subtle"
        >
          No failed dispatches recorded yet.
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full text-[14px]">
            <thead>
              <tr
                className="text-left text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Notification</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3 text-right">Attempt</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const terminal = r.status === "failed_terminal";
                return (
                  <tr
                    key={r.id}
                    className="border-b border-hairline last:border-b-0 align-top"
                  >
                    <td className="px-4 py-3 font-semibold">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
                        style={{
                          background: terminal
                            ? "var(--color-red-bg)"
                            : "var(--color-amber-bg)",
                          color: terminal
                            ? "var(--color-red-deep)"
                            : "var(--color-amber-deep)",
                        }}
                      >
                        {terminal ? (
                          <XCircle size={12} strokeWidth={2.4} />
                        ) : (
                          <AlertTriangle size={12} strokeWidth={2.4} />
                        )}
                        {r.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-strong">
                      {r.recipientName ?? "(deleted)"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink-strong font-medium truncate max-w-[260px]">
                        {r.notificationTitle}
                      </div>
                      <div className="text-[12px] text-ink-subtle">
                        {r.notificationKind}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      <div className="font-mono text-[12.5px] break-words max-w-[300px]">
                        {r.errorMessage ?? "(no message)"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                      {r.attemptCount} / 3
                    </td>
                    <td className="px-4 py-3 text-ink-subtle">
                      <div>{formatDistanceToNow(r.attemptedAt, { addSuffix: true })}</div>
                      {!terminal && r.nextAttemptAt && (
                        <div className="inline-flex items-center gap-1 text-[11.5px] text-ink-subtle mt-1">
                          <Loader2 size={10} className="animate-spin" />
                          retry {formatDistanceToNow(r.nextAttemptAt, { addSuffix: true })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "slate" | "amber" | "red";
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      <span className="font-bold">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
