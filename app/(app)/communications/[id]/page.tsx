import { notFound } from "next/navigation";
import { Megaphone, Paperclip, Download, Users, CheckCircle2, Clock, ShieldCheck, Lock } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { getBroadcastForEmployee, getBroadcastWithStats, getPollResults, getMyPollResponse } from "@/lib/ecos/queries";
import { PollCard } from "@/components/ecos/poll-card";
import type { BroadcastPoll } from "@/db/schema";
import { signAttachmentUrls } from "@/lib/ecos/media";
import { formatDate } from "@/lib/format";
import { Pill, MiniBar } from "@/components/ecos/pills";
import { MarkRead } from "@/components/ecos/mark-read";
import { AcknowledgeButton } from "@/components/ecos/acknowledge-button";
import { AdminActions } from "@/components/ecos/admin-actions";
import { RecipientTable } from "@/components/ecos/recipient-table";
import { WhatsappPanel } from "@/components/ecos/whatsapp-panel";
import { normChannels } from "@/lib/ecos/publish";
import {
  BROADCAST_CATEGORY_LABELS,
  BROADCAST_PRIORITY_LABELS,
  BROADCAST_PRIORITY_TONE,
  BROADCAST_STATUS_LABELS,
  BROADCAST_STATUS_TONE,
  RECEIPT_STATUS_LABELS,
  RECEIPT_STATUS_TONE,
  senderLabel,
  readAttachments,
  splitAttachments,
  pct,
} from "@/lib/ecos/labels";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BroadcastReadPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireUser();

  const result = await getBroadcastForEmployee(id, me.id);
  if (!result) notFound();

  const { broadcast: b, receipt } = result;
  const isRecipient = receipt !== null;

  // The analytics half. `getBroadcastWithStats` returns null for anyone who is
  // neither this broadcast's author nor a broadcast admin, so this ONE call is
  // both the data and the permission check — no second `isHrStaff` round trip
  // that could disagree with it.
  const stats = await getBroadcastWithStats(id);
  const isAuthor = stats !== null;

  // Not sent to me AND not mine to manage → I have no business reading it.
  if (!isRecipient && !isAuthor) notFound();

  const attachments = readAttachments(b.attachments);
  const { media, files } = splitAttachments(attachments);
  const signed = await signAttachmentUrls(attachments);

  // Inline poll / quiz (Phase 2) — tally + this viewer's own vote.
  const poll = (b.poll ?? null) as BroadcastPoll | null;
  let pollResults: { counts: number[]; total: number } | null = null;
  let myPollResponse: number | null = null;
  if (poll) {
    [pollResults, myPollResponse] = await Promise.all([
      getPollResults(b.id, poll.options.length),
      isRecipient ? getMyPollResponse(b.id, me.id) : Promise.resolve(null),
    ]);
  }

  const pTone = BROADCAST_PRIORITY_TONE[b.priority];
  const sTone = BROADCAST_STATUS_TONE[b.status];
  const needsAck = !!receipt && b.ackMode === "acknowledge" && receipt.status !== "acknowledged";
  const highPriority = b.priority === "critical" || b.priority === "emergency";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      {/* Fire the read-receipt once, only while still pending. */}
      {receipt && <MarkRead broadcastId={b.id} active={receipt.status === "pending"} />}

      <PageShell width="wide" style={{ maxWidth: "1180px" }}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── The message ─────────────────────────────────────────── */}
          <article className="wg-rise min-w-0">
            {/* Priority banner — emphatic for critical/emergency */}
            <div
              className="flex flex-wrap items-center gap-2 rounded-t-2xl px-5 py-3"
              style={
                highPriority
                  ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }
                  : { background: pTone.bg, boxShadow: `inset 0 0 0 1px ${pTone.border}` }
              }
            >
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: highPriority ? "#ffffff" : pTone.fg }}
              >
                {b.requireLock ? <Lock size={13} strokeWidth={2.6} /> : <Megaphone size={13} strokeWidth={2.6} />}
                {BROADCAST_PRIORITY_LABELS[b.priority]} priority
              </span>
              <span
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: highPriority ? "rgba(255,255,255,0.85)" : pTone.fg }}
              >
                · {BROADCAST_CATEGORY_LABELS[b.category]}
              </span>
            </div>

            <div className="rounded-b-2xl border border-t-0 border-hairline bg-surface-card px-6 py-6 max-md:px-5">
              <h1
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.022em", lineHeight: 1.08 }}
              >
                {b.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-ink-muted">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-strong">
                  <ShieldCheck size={14} strokeWidth={2.3} style={{ color: ACCENT_DEEP }} />
                  {senderLabel(b)}
                </span>
                {b.publishedAt && <span>{formatDate(b.publishedAt)}</span>}
                <Pill tone={sTone}>{BROADCAST_STATUS_LABELS[b.status]}</Pill>
              </div>

              {/* Image / video sent WITH the message — shown, not linked, and
                  above the words, because that is the order it was written in. */}
              {media.length > 0 && (
                <div className="mt-6 grid gap-3">
                  {media.map((m) => {
                    const url = signed.get(m.path);
                    if (!url) return null;
                    return m.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={m.path}
                        src={url}
                        alt={m.name}
                        className="w-full rounded-xl object-contain"
                        style={{ maxHeight: "60vh", background: "#0b0b0d" }}
                      />
                    ) : (
                      <video
                        key={m.path}
                        src={url}
                        controls
                        playsInline
                        className="w-full rounded-xl"
                        style={{ maxHeight: "60vh", background: "#0b0b0d" }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Body — sanitised on save (sanitizeRichHtml), rendered as
                  trusted HTML the same way the rich letter viewer does. */}
              <div
                className="ecos-body mt-6 text-[15px] leading-relaxed text-ink-strong"
                dangerouslySetInnerHTML={{ __html: b.bodyHtml || `<p>${escapeText(b.bodyText)}</p>` }}
              />

              {/* Inline poll / quiz */}
              {poll && pollResults && (
                <PollCard
                  broadcastId={b.id}
                  poll={poll}
                  initialCounts={pollResults.counts}
                  initialTotal={pollResults.total}
                  myResponse={myPollResponse}
                  canVote={isRecipient && myPollResponse === null}
                  hrView={isAuthor}
                />
              )}

              {/* Attachments — the DOWNLOAD kind only; media rendered above. */}
              {files.length > 0 && (
                <div className="mt-7 border-t border-hairline pt-5">
                  <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    <Paperclip size={13} strokeWidth={2.4} /> Attachments
                  </h2>
                  <ul className="mt-2.5 grid gap-2">
                    {files.map((a, i) => {
                      const url = signed.get(a.path) ?? null;
                      const inner = (
                        <>
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, #E10600 9%, white)", color: ACCENT_DEEP }}>
                            <Paperclip size={15} strokeWidth={2.3} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong" title={a.name}>
                            {a.name}
                          </span>
                          {url ? (
                            <Download size={16} strokeWidth={2.3} className="shrink-0 text-ink-soft" />
                          ) : (
                            <span className="shrink-0 text-[11px] font-semibold text-ink-soft">unavailable</span>
                          )}
                        </>
                      );
                      return (
                        <li key={`${a.path}-${i}`}>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5 transition-all hover:border-hairline-strong hover:shadow-sm"
                            >
                              {inner}
                            </a>
                          ) : (
                            <div className="flex items-center gap-3 rounded-xl border border-hairline bg-white px-3 py-2.5 opacity-70">
                              {inner}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Recipient acknowledgement zone */}
              {receipt && (
                <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">Your status</span>
                  <Pill tone={RECEIPT_STATUS_TONE[receipt.status]}>{RECEIPT_STATUS_LABELS[receipt.status]}</Pill>
                  {needsAck && <AcknowledgeButton broadcastId={b.id} />}
                  {receipt.status === "acknowledged" && receipt.acknowledgedAt && (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted">
                      <CheckCircle2 size={14} strokeWidth={2.3} className="text-emerald-600" />
                      Acknowledged {formatDate(receipt.acknowledgedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* ── Author analytics ────────────────────────────────────── */}
          {stats && <AnalyticsPanel id={b.id} status={b.status} stats={stats} />}
        </div>

        {/* ── Who read it, and the manual WhatsApp send ─────────────── */}
        {stats && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <RecipientTable
              rows={stats.recipients.map((r) => ({
                employeeId: r.employeeId,
                name: r.name,
                email: r.email,
                department: r.department,
                status: r.status,
                deliveredAt: r.deliveredAt?.toISOString() ?? null,
                readAt: r.readAt?.toISOString() ?? null,
                acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
                deliveredChannels: r.deliveredChannels,
                snoozeCount: r.snoozeCount,
              }))}
            />
            {/* Only when the sender asked for it — an unwanted list of every
                colleague's phone number is not a panel to show by default. */}
            {normChannels(b.channels).includes("whatsapp_manual") && (
              <WhatsappPanel
                targets={stats.recipients.map((r) => ({
                  employeeId: r.employeeId,
                  name: r.name,
                  phone: r.phone,
                }))}
                subject={b.title}
                from={senderLabel(b)}
                bodyText={b.bodyText || b.title}
                link={`/communications/${b.id}`}
              />
            )}
          </div>
        )}
      </PageShell>

      {/* Scoped, safe typography for the trusted broadcast HTML. */}
      <style dangerouslySetInnerHTML={{ __html: ECOS_BODY_CSS }} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Author analytics panel                                               */
/* ------------------------------------------------------------------ */

function AnalyticsPanel({
  id,
  status,
  stats,
}: {
  id: string;
  status: string;
  stats: NonNullable<Awaited<ReturnType<typeof getBroadcastWithStats>>>;
}) {
  const { total, read, acknowledged, pending } = stats.stats;
  // `read` from getBroadcastWithStats is the read-but-not-acked bucket; the
  // cumulative "opened" figure is read + acknowledged.
  const opened = read + acknowledged;
  const readPct = pct(opened, total);
  const ackPct = pct(acknowledged, total);
  const snoozes = stats.recipients.reduce((n, r) => n + r.snoozeCount, 0);

  const tiles: Array<{ label: string; value: number; color: string }> = [
    { label: "Recipients", value: total, color: "#334155" },
    { label: "Read", value: opened, color: "#16a34a" },
    { label: "Acknowledged", value: acknowledged, color: ACCENT },
    { label: "Pending", value: pending, color: "#b45309" },
  ];

  // Avg time from publish → first open (read or acknowledge), for opened recipients.
  const pubAt = stats.broadcast.publishedAt;
  const openedRows = stats.recipients.filter((r) => r.readAt || r.acknowledgedAt);
  const avgOpenMins =
    pubAt && openedRows.length
      ? Math.round(
          openedRows.reduce((s, r) => {
            const t = r.readAt ?? r.acknowledgedAt;
            return s + (t ? (t.getTime() - pubAt.getTime()) / 60000 : 0);
          }, 0) / openedRows.length,
        )
      : null;

  return (
    <aside className="wg-rise flex flex-col gap-4 self-start rounded-2xl border border-hairline bg-surface-card p-5 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, #E10600 9%, white)", color: ACCENT_DEEP }}>
            <Users size={16} strokeWidth={2.3} />
          </span>
          <h2 className="text-[15px] font-bold text-ink-strong">Delivery analytics</h2>
        </div>
        <a
          href={`/communications/${id}/export`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink-strong transition hover:border-hairline-strong"
          title="Download the per-recipient delivery breakdown as CSV"
        >
          <Download size={13} strokeWidth={2.4} /> CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-hairline bg-white px-3 py-2.5">
            <div className="text-[22px] font-black tabular-nums leading-none" style={{ color: t.color, fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              {t.value}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2.5">
        <MiniBar label="Read" value={readPct} color="#16a34a" />
        <MiniBar label="Acknowledged" value={ackPct} color={ACCENT} />
      </div>

      {avgOpenMins != null && (
        <div className="flex items-center justify-between rounded-xl border border-hairline bg-white px-3 py-2 text-[12.5px]">
          <span className="font-semibold text-ink-soft">Avg time to open</span>
          <span className="font-bold tabular-nums text-ink-strong">{humanizeMins(avgOpenMins)}</span>
        </div>
      )}

      <div className="border-t border-hairline pt-4">
        <AdminActions broadcastId={id} status={status} pendingCount={pending} />
      </div>

      {/* Popup behaviour — the number nobody else reports. A high snooze count
          on a message people still have not read is the signal that it is being
          dismissed rather than missed. The full per-person breakdown is in the
          "Who has read this" table below, so this is the headline only. */}
      <div className="border-t border-hairline pt-4">
        <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          <Clock size={13} strokeWidth={2.4} /> Popup
        </h3>
        {pending === 0 ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
            <CheckCircle2 size={14} strokeWidth={2.3} /> Everyone has opened this.
          </p>
        ) : (
          <p className="mt-2 text-[13px] font-medium text-ink-muted">
            <strong className="text-ink-strong">{pending}</strong> still unread
            {snoozes > 0 && (
              <>
                {" "}· closed{" "}
                <strong className="text-ink-strong">{snoozes}</strong> time
                {snoozes === 1 ? "" : "s"} without reading
              </>
            )}
            .
          </p>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** "2h 15m" / "45m" / "3d 4h" from a minute count (delivery latency display). */
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

/** Escape plain-text fallback (used only when a broadcast has no bodyHtml). */
function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

// Minimal, scoped typography so authored HTML (headings, lists, links, bold)
// renders cleanly inside the message card without leaking global styles.
const ECOS_BODY_CSS = `
  .ecos-body h1, .ecos-body h2, .ecos-body h3 { font-family: var(--font-display), system-ui, sans-serif; font-weight: 800; letter-spacing: -0.01em; color: #18181b; margin: 1.1em 0 0.4em; line-height: 1.2; }
  .ecos-body h1 { font-size: 1.5em; }
  .ecos-body h2 { font-size: 1.28em; }
  .ecos-body h3 { font-size: 1.12em; }
  .ecos-body p { margin: 0.65em 0; }
  .ecos-body ul, .ecos-body ol { margin: 0.65em 0; padding-left: 1.4em; }
  .ecos-body li { margin: 0.25em 0; }
  .ecos-body ul { list-style: disc; }
  .ecos-body ol { list-style: decimal; }
  .ecos-body a { color: #A80400; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .ecos-body strong, .ecos-body b { font-weight: 700; color: #18181b; }
  .ecos-body blockquote { margin: 0.8em 0; padding: 0.4em 0 0.4em 1em; border-left: 3px solid color-mix(in srgb, #E10600 45%, white); color: #475569; }
  .ecos-body img { max-width: 100%; height: auto; border-radius: 10px; }
  .ecos-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.2em 0; }
  .ecos-body table { width: 100%; border-collapse: collapse; margin: 0.8em 0; }
  .ecos-body td, .ecos-body th { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
`;
