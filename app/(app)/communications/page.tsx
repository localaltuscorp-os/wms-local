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
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { listBroadcasts, listMyBroadcasts, getEcosOrgStats } from "@/lib/ecos/queries";
import { formatDate } from "@/lib/format";
import { Pill, MiniBar } from "@/components/ecos/pills";
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

export default async function CommunicationsHomePage() {
  const me = await requireUser();
  const author = await isHrStaff(me);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide" style={{ maxWidth: "1180px" }}>
        <header className="mb-7 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Megaphone size={13} strokeWidth={2.6} /> Altus · Communications
          </span>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(28px, 3.4vw, 44px)",
                  letterSpacing: "-0.025em",
                  lineHeight: 1.04,
                }}
              >
                Enterprise Communications
              </h1>
              <p className="mt-1.5 max-w-[62ch] text-[13.5px] font-medium leading-snug text-ink-muted">
                {author
                  ? "Author, publish and track every company-wide broadcast — with live read and acknowledgement receipts per message."
                  : "Every announcement, policy and message sent to you — in one place, newest first."}
              </p>
            </div>
            {author && (
              <Link
                href={"/communications/compose" as Route}
                className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
              >
                <Plus size={16} strokeWidth={2.6} className="transition-transform group-hover:rotate-90" />
                New Broadcast
              </Link>
            )}
          </div>
        </header>

        {author ? <AuthorList /> : <EmployeeInbox employeeId={me.id} />}
      </PageShell>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Author dashboard                                                     */
/* ------------------------------------------------------------------ */

async function AuthorList() {
  const [rows, org] = await Promise.all([listBroadcasts(), getEcosOrgStats()]);

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Megaphone}
        title="No broadcasts yet"
        body="Create your first company-wide message — announcements, policies, CEO notes and more, with delivery + read tracking."
        cta={{ href: "/communications/compose", label: "New Broadcast" }}
      />
    );
  }

  const orgTiles: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Broadcasts", value: String(org.totalBroadcasts) },
    { label: "Published", value: String(org.published) },
    { label: "Scheduled", value: String(org.scheduled), tone: "#b45309" },
    { label: "Avg read", value: `${org.avgReadPct}%`, tone: "#16a34a" },
    { label: "Avg ack", value: `${org.avgAckPct}%`, tone: ACCENT },
  ];

  return (
    <>
      {/* Org BI strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {orgTiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-hairline bg-surface-card px-3.5 py-3">
            <div
              className="text-[24px] font-black leading-none tabular-nums"
              style={{ color: t.tone ?? "#334155", fontFamily: "var(--font-display), system-ui, sans-serif" }}
            >
              {t.value}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3.5">
      {rows.map((b, i) => {
        const pTone = BROADCAST_PRIORITY_TONE[b.priority];
        const sTone = BROADCAST_STATUS_TONE[b.status];
        const readPct = pct(b.readCount, b.recipientCount);
        const ackPct = pct(b.ackCount, b.recipientCount);
        return (
          <Link
            key={b.id}
            href={`/communications/${b.id}` as Route}
            className="group wg-rise relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5 transition-all hover:border-hairline-strong hover:shadow-lg md:flex-row md:items-center"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})` }} />
            {/* Title + chips */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={pTone}>{BROADCAST_PRIORITY_LABELS[b.priority]}</Pill>
                <Pill tone={{ fg: "#334155", bg: "#f1f5f9", border: "#e2e8f0" }}>
                  {BROADCAST_CATEGORY_LABELS[b.category]}
                </Pill>
                <Pill tone={sTone}>{BROADCAST_STATUS_LABELS[b.status]}</Pill>
              </div>
              <h2
                className="mt-2 truncate text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.012em" }}
                title={b.title}
              >
                {b.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-medium text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} strokeWidth={2.2} /> {b.recipientCount} recipient{b.recipientCount === 1 ? "" : "s"}
                </span>
                <span>{b.publishedAt ? formatDate(b.publishedAt) : "Not published"}</span>
                {b.authorName && <span className="truncate">by {b.authorName}</span>}
              </div>
            </div>
            {/* Read / ack mini-bars */}
            <div className="flex w-full shrink-0 flex-col gap-2.5 md:w-[240px]">
              <MiniBar label="Read" value={readPct} color="#16a34a" />
              <MiniBar label="Acknowledged" value={ackPct} color={ACCENT} />
            </div>
            <ArrowUpRight size={18} className="hidden shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 md:block" />
          </Link>
        );
      })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Employee inbox                                                       */
/* ------------------------------------------------------------------ */

async function EmployeeInbox({ employeeId }: { employeeId: string }) {
  const rows = await listMyBroadcasts(employeeId);
  // Only surface what's actually live for the recipient (published / paused);
  // drafts never reach recipients, but guard defensively.
  const visible = rows.filter((r) => r.broadcast.status !== "draft" && r.broadcast.status !== "scheduled");

  if (visible.length === 0) {
    return (
      <EmptyState
        Icon={Inbox}
        title="No messages yet"
        body="Company announcements, policies and updates sent to you will appear here."
      />
    );
  }

  return (
    <div className="grid gap-3.5">
      {visible.map(({ broadcast: b, receipt }, i) => {
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
              borderColor: needsAck ? "color-mix(in srgb, #E10600 45%, white)" : "var(--color-hairline, #e2e8f0)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: needsAck ? `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})` : "#e2e8f0" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={pTone}>{BROADCAST_PRIORITY_LABELS[b.priority]}</Pill>
                <Pill tone={{ fg: "#334155", bg: "#f1f5f9", border: "#e2e8f0" }}>
                  {BROADCAST_CATEGORY_LABELS[b.category]}
                </Pill>
                {needsAck && (
                  <Pill tone={{ fg: "#A80400", bg: "#fef2f2", border: "#fecaca" }}>
                    {b.requireLock ? <Lock size={11} strokeWidth={2.6} /> : <AlertTriangle size={11} strokeWidth={2.6} />}
                    Acknowledge required
                  </Pill>
                )}
              </div>
              <h2
                className="mt-2 truncate text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.012em" }}
                title={b.title}
              >
                {b.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-medium text-ink-muted">
                <span>From {senderLabel(b)}</span>
                <span>{b.publishedAt ? formatDate(b.publishedAt) : formatDate(receipt.createdAt)}</span>
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
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      <p className="mt-1.5 max-w-[46ch] text-[13.5px] font-medium leading-snug text-ink-muted">{body}</p>
      {cta && (
        <Link
          href={cta.href as Route}
          className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
        >
          <Plus size={16} strokeWidth={2.6} /> {cta.label}
        </Link>
      )}
    </div>
  );
}
