import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  BarChart3,
  Users,
  Eye,
  ShieldCheck,
  Clock,
  MoonStar,
  TrendingDown,
  Megaphone,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { getBroadcastAnalytics } from "@/lib/ecos/queries";
import { MiniBar } from "@/components/ecos/pills";
import { ArchiveOldButton } from "@/components/ecos/archive-old-button";
import {
  BROADCAST_CATEGORY_LABELS,
  BROADCAST_PRIORITY_LABELS,
  BROADCAST_PRIORITY_TONE,
} from "@/lib/ecos/labels";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  email: "Email",
  push: "Push",
  whatsapp_manual: "WhatsApp (manual)",
};

/**
 * BROADCAST DASHBOARD — did the messages land?
 *
 * Everything here is SCOPED to what the viewer may see (lib/ecos/queries.ts):
 * a broadcast admin gets the whole org, everyone else gets the broadcasts they
 * sent. That is deliberate — now that anyone can send, a sender needs a real
 * dashboard of their OWN reach, not an empty page that only HR ever fills in.
 *
 * The page is built around one question rather than a wall of counters. Reach
 * (how many people), engagement (how many actually opened it), speed (how long
 * it took), and friction (how often the popup got closed unread) — then the
 * five broadcasts doing worst, because those are the only rows anyone acts on.
 */
export default async function BroadcastDashboardPage() {
  await requireUser();
  const a = await getBroadcastAnalytics();

  const orgWide = a.scope === "org";
  const t = a.totals;

  const tiles: Array<{ label: string; value: string; sub: string; color: string; Icon: typeof Users }> = [
    {
      label: "Broadcasts",
      value: String(t.totalBroadcasts),
      sub: `${t.published} sent · ${t.scheduled} scheduled · ${t.drafts} draft`,
      color: "#334155",
      Icon: Megaphone,
    },
    {
      label: "People reached",
      value: String(t.totalRecipients),
      sub: "recipient records across all sends",
      color: "#334155",
      Icon: Users,
    },
    {
      label: "Read",
      value: `${t.avgReadPct}%`,
      sub: `${t.totalReads} of ${t.totalRecipients} opened`,
      color: "#16a34a",
      Icon: Eye,
    },
    {
      label: "Acknowledged",
      value: `${t.avgAckPct}%`,
      sub: `${t.totalAcks} explicit acknowledgements`,
      color: ACCENT,
      Icon: ShieldCheck,
    },
  ];

  const peakDay = Math.max(1, ...a.timeline.map((d) => d.sent));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar title="Broadcast dashboard" />
      <PageShell width="wide" style={{ maxWidth: "1180px" }}>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link
            href={"/communications" as Route}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-strong transition hover:border-hairline-strong"
          >
            <ArrowLeft size={14} strokeWidth={2.6} /> Back to broadcasts
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
            <BarChart3 size={14} strokeWidth={2.4} />
            {orgWide ? "Whole organisation" : "The broadcasts you sent"}
          </span>
          <div className="ml-auto">
            <ArchiveOldButton />
          </div>
        </div>

        {t.totalBroadcasts === 0 ? (
          <div className="wg-rise rounded-3xl border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center">
            <h2
              className="text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22 }}
            >
              Nothing to measure yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-[48ch] text-[13.5px] font-medium text-ink-muted">
              Send a broadcast and this fills in — who it reached, who opened it, how fast, and
              which messages are being ignored.
            </p>
            <Link
              href={"/communications/compose" as Route}
              className="mt-5 inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              New Broadcast
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Headline tiles */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((tile) => (
                <div key={tile.label} className="wg-rise rounded-2xl border border-hairline bg-surface-card p-4">
                  <div className="flex items-center gap-2 text-ink-soft">
                    <tile.Icon size={14} strokeWidth={2.4} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em]">{tile.label}</span>
                  </div>
                  <div
                    className="mt-2 text-[30px] font-black leading-none tabular-nums"
                    style={{ color: tile.color, fontFamily: "var(--font-display), system-ui, sans-serif" }}
                  >
                    {tile.value}
                  </div>
                  <div className="mt-1.5 text-[12px] font-medium text-ink-muted">{tile.sub}</div>
                </div>
              ))}
            </div>

            {/* Speed + friction */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                Icon={Clock}
                label="Median time to open"
                value={a.medianOpenMinutes == null ? "—" : humanizeMins(a.medianOpenMinutes)}
                help="Half of everyone who opened a broadcast did so within this long of it being sent. Median, not average, so one person opening a week late doesn't move it."
              />
              <Stat
                Icon={MoonStar}
                label="Popups closed unread"
                value={String(a.snoozes.totalSnoozes)}
                help={
                  a.snoozes.recipientsWhoSnoozed === 0
                    ? "Nobody has closed a broadcast popup without reading it."
                    : `${a.snoozes.recipientsWhoSnoozed} ${a.snoozes.recipientsWhoSnoozed === 1 ? "person has" : "people have"} closed a popup with the ✕ — it comes back at their next login.`
                }
              />
            </div>

            {/* 30-day send timeline */}
            <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5">
              <h2 className="text-[15px] font-bold text-ink-strong">Sent over the last 30 days</h2>
              <div className="mt-4 flex h-[110px] items-end gap-[3px]">
                {a.timeline.map((d) => (
                  <div
                    key={d.day}
                    className="min-w-0 flex-1 rounded-t-[3px] transition-all"
                    title={`${d.day}: ${d.sent} broadcast${d.sent === 1 ? "" : "s"}`}
                    style={{
                      height: `${Math.max(d.sent === 0 ? 2 : 8, (d.sent / peakDay) * 100)}%`,
                      background: d.sent === 0 ? "#eef2f7" : `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-semibold text-ink-soft">
                <span>{a.timeline[0]?.day}</span>
                <span>Today</span>
              </div>
            </section>

            {/* Breakdowns */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Breakdown
                title="By category"
                rows={a.byCategory.map((r) => ({
                  key: r.key,
                  label: BROADCAST_CATEGORY_LABELS[r.key] ?? r.key,
                  sent: r.sent,
                  recipients: r.recipients,
                  readPct: r.readPct,
                  color: "#16a34a",
                }))}
              />
              <Breakdown
                title="By priority"
                rows={a.byPriority.map((r) => ({
                  key: r.key,
                  label: BROADCAST_PRIORITY_LABELS[r.key] ?? r.key,
                  sent: r.sent,
                  recipients: r.recipients,
                  readPct: r.readPct,
                  color: BROADCAST_PRIORITY_TONE[r.key]?.fg ?? ACCENT,
                }))}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Channels */}
              <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5">
                <h2 className="text-[15px] font-bold text-ink-strong">Delivered by channel</h2>
                <p className="mt-1 text-[12px] font-medium text-ink-muted">
                  Counted per recipient, per channel that actually accepted the message.
                </p>
                {a.byChannel.length === 0 ? (
                  <p className="mt-3 text-[13px] font-medium text-ink-muted">Nothing delivered yet.</p>
                ) : (
                  <ul className="mt-3 grid gap-2.5">
                    {a.byChannel.map((c) => (
                      <li key={c.channel}>
                        <MiniBar
                          label={CHANNEL_LABELS[c.channel] ?? c.channel}
                          value={Math.round((c.delivered / Math.max(1, a.byChannel[0]!.delivered)) * 100)}
                          color="#334155"
                        />
                        <div className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-ink-soft">
                          {c.delivered} deliveries
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Worst read — the only rows anyone acts on */}
              <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5">
                <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-ink-strong">
                  <TrendingDown size={15} strokeWidth={2.4} className="text-amber-600" />
                  Least read
                </h2>
                <p className="mt-1 text-[12px] font-medium text-ink-muted">
                  Published broadcasts with the lowest open rate — the ones worth a nudge.
                </p>
                {a.worstRead.length === 0 ? (
                  <p className="mt-3 text-[13px] font-medium text-ink-muted">Nothing published yet.</p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {a.worstRead.map((w) => (
                      <li key={w.id}>
                        <Link
                          href={`/communications/${w.id}` as Route}
                          className="block rounded-xl border border-hairline px-3 py-2.5 transition hover:border-hairline-strong hover:shadow-sm"
                        >
                          <div className="truncate text-[13.5px] font-semibold text-ink-strong" title={w.title}>
                            {w.title}
                          </div>
                          <div className="mt-1.5">
                            <MiniBar
                              label={`${w.reads} of ${w.recipients} read`}
                              value={w.readPct}
                              color={w.readPct < 50 ? "#b45309" : "#16a34a"}
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Who sends (org view only — a sender is always just themselves) */}
            {orgWide && a.topSenders.length > 0 && (
              <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5">
                <h2 className="text-[15px] font-bold text-ink-strong">Who is broadcasting</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                        <th className="pb-2">Sender</th>
                        <th className="pb-2 text-right">Broadcasts</th>
                        <th className="pb-2 text-right">Reached</th>
                        <th className="pb-2 text-right">Read rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.topSenders.map((sdr) => (
                        <tr key={sdr.name} className="border-t border-hairline">
                          <td className="py-2 font-semibold text-ink-strong">{sdr.name}</td>
                          <td className="py-2 text-right tabular-nums text-ink-muted">{sdr.sent}</td>
                          <td className="py-2 text-right tabular-nums text-ink-muted">{sdr.recipients}</td>
                          <td
                            className="py-2 text-right font-bold tabular-nums"
                            style={{ color: sdr.readPct < 50 ? "#b45309" : "#16a34a" }}
                          >
                            {sdr.readPct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </PageShell>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

function Stat({
  Icon,
  label,
  value,
  help,
}: {
  Icon: typeof Clock;
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="wg-rise rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex items-center gap-2 text-ink-soft">
        <Icon size={14} strokeWidth={2.4} />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em]">{label}</span>
      </div>
      <div
        className="mt-2 text-[26px] font-black leading-none tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        {value}
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-snug text-ink-muted">{help}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; sent: number; recipients: number; readPct: number; color: string }>;
}) {
  return (
    <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5">
      <h2 className="text-[15px] font-bold text-ink-strong">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] font-medium text-ink-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13.5px] font-semibold text-ink-strong">{r.label}</span>
                <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-ink-soft">
                  {r.sent} sent · {r.recipients} people
                </span>
              </div>
              <div className="mt-1">
                <MiniBar label="Read" value={r.readPct} color={r.color} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "2h 15m" / "45m" / "3d 4h" from a minute count. */
function humanizeMins(mins: number): string {
  if (mins < 1) return "< 1m";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}
