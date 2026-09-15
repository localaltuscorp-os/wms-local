import Link from "next/link";
import type { Route } from "next";
import {
  Megaphone,
  Plus,
  Users,
  ArrowUpRight,
  Inbox,
  AlertTriangle,
  Lock,
  Repeat,
  CalendarClock,
  Archive,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { listBroadcasts, listMyBroadcasts, type BroadcastListItem } from "@/lib/ecos/queries";
import { formatDate } from "@/lib/format";
import { Pill, MiniBar } from "@/components/ecos/pills";
import { BroadcastRowActions } from "@/components/ecos/broadcast-row-actions";
import { BroadcastTabs, type BroadcastTab } from "@/components/ecos/broadcast-tabs";
import {
  BROADCAST_CATEGORY_LABELS,
  BROADCAST_PRIORITY_LABELS,
  BROADCAST_PRIORITY_TONE,
  BROADCAST_STATUS_LABELS,
  BROADCAST_STATUS_TONE,
  RECEIPT_STATUS_LABELS,
  RECEIPT_STATUS_TONE,
  senderLabel,
  pct,
} from "@/lib/ecos/labels";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * BROADCASTS — home.
 *
 * TWO STACKED SURFACES, not two audiences. Everyone can send a broadcast now
 * (lib/ecos/permissions.ts), so everyone sees both halves of the module: the
 * messages sent TO them, and the ones they have sent. The page used to fork on
 * `isHrStaff` and show a normal employee only their inbox, which made "anyone
 * can broadcast" invisible to the people it was opened up for.
 *
 * There is no "New Broadcast" button in the page header. There was, and it sat
 * a few hundred pixels above and to the right of the identical button in the
 * empty state — two buttons, one job, and a header whose only content was the
 * duplicate, which pushed the entire page down for nothing. The compose entry
 * now lives with the content: in the tab strip when there are broadcasts, and
 * in the empty state when there are none.
 */
export default async function CommunicationsHomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireUser();
  const { tab: rawTab } = await searchParams;
  const tab: BroadcastTab =
    rawTab === "sent" || rawTab === "archived" ? rawTab : "inbox";

  const [sent, inbox] = await Promise.all([
    listBroadcasts().catch(() => [] as BroadcastListItem[]),
    listMyBroadcasts(me.id).catch(() => []),
  ]);

  // What belongs in an INBOX:
  //   - not a draft or a scheduled send, which never reached a recipient at all
  //     (a receipt row shouldn't exist for those, but guard defensively);
  //   - and not ARCHIVED. Archiving is how a notice is retired, so it has to
  //     leave every list except Archived — it used to leave the Sent list and
  //     stay sitting in the inbox, which made the button look like it had done
  //     nothing. Receipts are still kept either way; archiving hides, it does
  //     not delete.
  const myMessages = inbox.filter(
    (r) =>
      r.broadcast.status !== "draft" &&
      r.broadcast.status !== "scheduled" &&
      r.broadcast.status !== "archived",
  );
  const active = sent.filter((b) => b.status !== "archived");
  const archivedSent = sent.filter((b) => b.status === "archived");

  // Archived messages you RECEIVED but did not send. Without this an archived
  // broadcast would vanish from a recipient's view entirely — Archived only
  // ever listed your own sends — so the tab carries both halves. De-duplicated
  // against the sent half, since the author of an org-wide broadcast is also
  // one of its recipients and would otherwise see it twice.
  const sentIds = new Set(archivedSent.map((b) => b.id));
  const archivedInbox = inbox.filter(
    (r) => r.broadcast.status === "archived" && !sentIds.has(r.broadcast.id),
  );
  const archivedCount = archivedSent.length + archivedInbox.length;
  const unread = myMessages.filter((r) => r.receipt.status === "pending").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar />
      <PageShell width="wide" style={{ maxWidth: "1180px" }}>
        <BroadcastTabs
          active={tab}
          counts={{ inbox: myMessages.length, sent: active.length, archived: archivedCount }}
          unread={unread}
        />

        {tab === "inbox" && <EmployeeInbox rows={myMessages} />}
        {tab === "sent" && <SentList rows={active} empty="sent" />}
        {tab === "archived" && (
          <div className="grid gap-3.5">
            {/* Ones you sent keep their read/ack bars and their manage buttons;
                ones you only received render as the inbox cards they were. */}
            {archivedSent.length > 0 && <SentList rows={archivedSent} empty="archived" />}
            {archivedInbox.length > 0 && <EmployeeInbox rows={archivedInbox} />}
            {archivedCount === 0 && <SentList rows={[]} empty="archived" />}
          </div>
        )}
      </PageShell>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sent / archived list                                                 */
/* ------------------------------------------------------------------ */

function SentList({ rows, empty }: { rows: BroadcastListItem[]; empty: "sent" | "archived" }) {
  if (rows.length === 0) {
    return empty === "archived" ? (
      <EmptyState
        Icon={Archive}
        title="Nothing archived"
        body="Retired broadcasts land here. Archiving keeps every read receipt — it just takes the message out of the active list."
      />
    ) : (
      <EmptyState
        Icon={Megaphone}
        title="No broadcasts yet"
        body="Send your first one — to everyone, to a department, or to one person. It pops up on their screen within seconds and lands in their notifications."
        cta={{ href: "/communications/compose", label: "New Broadcast" }}
      />
    );
  }

  return (
    <div className="grid gap-3.5">
      {rows.map((b, i) => {
        const pTone = BROADCAST_PRIORITY_TONE[b.priority];
        const sTone = BROADCAST_STATUS_TONE[b.status];
        const readPct = pct(b.readCount, b.recipientCount);
        const ackPct = pct(b.ackCount, b.recipientCount);
        const editable = b.status === "draft" || b.status === "scheduled";
        return (
          <div
            key={b.id}
            className="group wg-rise relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5 transition-all hover:border-hairline-strong hover:shadow-lg md:flex-row md:items-center"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={pTone}>{BROADCAST_PRIORITY_LABELS[b.priority]}</Pill>
                <Pill tone={{ fg: "#334155", bg: "#f1f5f9", border: "#e2e8f0" }}>
                  {BROADCAST_CATEGORY_LABELS[b.category]}
                </Pill>
                <Pill tone={sTone}>{BROADCAST_STATUS_LABELS[b.status]}</Pill>
                {b.recurrence !== "none" && (
                  <Pill tone={{ fg: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" }}>
                    <Repeat size={11} strokeWidth={2.6} />
                    Repeats {b.recurrence}
                  </Pill>
                )}
              </div>
              <h2
                className="mt-2 truncate text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: "-0.012em",
                }}
                title={b.title}
              >
                <Link
                  href={
                    (editable
                      ? `/communications/compose?draft=${b.id}`
                      : `/communications/${b.id}`) as Route
                  }
                  className="outline-none hover:underline focus-visible:underline"
                >
                  {b.title}
                </Link>
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-medium text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} strokeWidth={2.2} /> {b.recipientCount} recipient
                  {b.recipientCount === 1 ? "" : "s"}
                </span>
                {b.status === "scheduled" && b.scheduledFor ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={13} strokeWidth={2.2} /> {formatDate(b.scheduledFor)}
                  </span>
                ) : (
                  <span>{b.publishedAt ? formatDate(b.publishedAt) : "Not sent yet"}</span>
                )}
                {b.authorName && <span className="truncate">by {b.authorName}</span>}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2.5 md:w-[220px]">
              <MiniBar label="Read" value={readPct} color="#16a34a" />
              <MiniBar label="Acknowledged" value={ackPct} color={ACCENT} />
            </div>

            <BroadcastRowActions
              broadcastId={b.id}
              status={b.status}
              title={b.title}
              canManage={b.canManage}
            />

            <Link
              href={
                (editable
                  ? `/communications/compose?draft=${b.id}`
                  : `/communications/${b.id}`) as Route
              }
              aria-label={`Open ${b.title}`}
              className="hidden shrink-0 text-ink-soft transition-transform hover:-translate-y-0.5 hover:translate-x-0.5 md:block"
            >
              <ArrowUpRight size={18} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Employee inbox                                                       */
/* ------------------------------------------------------------------ */

function EmployeeInbox({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listMyBroadcasts>>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Inbox}
        title="No messages yet"
        body="Announcements, updates and notices sent to you will appear here — and pop up on your screen the moment they're sent."
      />
    );
  }

  return (
    <div className="grid gap-3.5">
      {rows.map(({ broadcast: b, receipt }, i) => {
        const pTone = BROADCAST_PRIORITY_TONE[b.priority];
        const rTone = RECEIPT_STATUS_TONE[receipt.status];
        const needsAck = b.ackMode === "acknowledge" && receipt.status !== "acknowledged";
        return (
          <Link
            key={b.id}
            href={`/communications/${b.id}` as Route}
            className="group wg-rise relative flex items-start gap-4 overflow-hidden rounded-2xl border bg-surface-card p-5 transition-all hover:shadow-lg"
            style={{
              animationDelay: `${i * 35}ms`,
              borderColor: needsAck
                ? "color-mix(in srgb, #E10600 45%, white)"
                : "var(--color-hairline, #e2e8f0)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{
                background: needsAck
                  ? `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`
                  : "#e2e8f0",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={pTone}>{BROADCAST_PRIORITY_LABELS[b.priority]}</Pill>
                <Pill tone={{ fg: "#334155", bg: "#f1f5f9", border: "#e2e8f0" }}>
                  {BROADCAST_CATEGORY_LABELS[b.category]}
                </Pill>
                {needsAck && (
                  <Pill tone={{ fg: "#A80400", bg: "#fef2f2", border: "#fecaca" }}>
                    {b.requireLock ? (
                      <Lock size={11} strokeWidth={2.6} />
                    ) : (
                      <AlertTriangle size={11} strokeWidth={2.6} />
                    )}
                    Acknowledge required
                  </Pill>
                )}
              </div>
              <h2
                className="mt-2 truncate text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: "-0.012em",
                }}
                title={b.title}
              >
                {b.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-medium text-ink-muted">
                <span>From {senderLabel(b)}</span>
                <span>
                  {b.publishedAt ? formatDate(b.publishedAt) : formatDate(receipt.createdAt)}
                </span>
              </div>
            </div>
            <div className="shrink-0 self-center">
              <Pill tone={rTone}>{RECEIPT_STATUS_LABELS[receipt.status]}</Pill>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared empty state                                                   */
/* ------------------------------------------------------------------ */

function EmptyState({
  Icon,
  title,
  body,
  cta,
}: {
  Icon: typeof Megaphone;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="wg-rise flex flex-col items-center justify-center rounded-3xl border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center">
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, #E10600 10%, white)", color: ACCENT_DEEP }}
      >
        <Icon size={26} strokeWidth={2.2} />
      </span>
      <h2
        className="mt-4 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "-0.015em",
        }}
      >
        {title}
      </h2>
      <p className="mt-1.5 max-w-[46ch] text-[13.5px] font-medium leading-snug text-ink-muted">
        {body}
      </p>
      {cta && (
        <Link
          href={cta.href as Route}
          className="mt-5 inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
          }}
        >
          <Plus size={16} strokeWidth={2.6} /> {cta.label}
        </Link>
      )}
    </div>
  );
}
