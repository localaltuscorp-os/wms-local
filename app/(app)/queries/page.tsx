import Link from "next/link";
import type { Route } from "next";
import { BellRing, MessageCircleQuestion, Send } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { hrSupportEnabled } from "@/lib/hr/flag";
import {
  resolveViewer,
  listMyTickets,
  listHrNotifications,
} from "@/lib/queries/hr-support";
import { TicketComposer } from "@/components/hr/ticket-composer/ticket-composer";
import { NotificationInboxButton } from "@/components/hr/queries/notification-inbox-button";
import { QueriesBoard } from "@/components/hr/queries/queries-board";
import { relTime } from "@/lib/hr/ticket-ui";

const RED = "var(--color-altus-red)";

export const dynamic = "force-dynamic";

/**
 * QUERIES & NOTIFICATIONS — ask HR, then track what you asked.
 *
 * ── THE SHAPE, AND WHY IT CHANGED TWICE ───────────────────────────────────
 * It began as a 900px column holding one unlabelled form and an empty grey
 * box. That became a composer card in a left column with a 340px notifications
 * aside — which fixed the content but created a worse hole than the one it
 * closed: the composer is tall and the notifications list is usually EMPTY, so
 * the page was a 600px tower of form with 600px of nothing beside it.
 *
 * Two unequal columns cannot be fixed by tightening either one. So the
 * composer is FULL WIDTH now, and the two things that actually grow together —
 * your questions and your notifications — sit side by side underneath it:
 *
 *     ┌──────────────── Ask HR a question ─────────────────┐
 *     ├──────── Your questions ────────┬── Notifications ──┤
 *
 * Both list headings now start on the same line, which is the other half of
 * the complaint: before, "NOTIFICATIONS" sat level with the top of the form
 * and "YOUR QUESTIONS" sat 660px below it, so nothing on the page lined up
 * with anything else.
 *
 * The width is 1400, the same measure as Reimbursements, so moving between
 * the two employee pages does not move the page edges.
 */
export default async function QueriesPage() {
  // Re-parented from HR to the Employees room (2026-07) — an employee surface.
  const me = await requireWorkspace("employees");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Queries & Notifications"
        Icon={BellRing}
        blurb="Raise HR queries, track their status, and stay on top of company notices and announcements. This section is being built."
      />
    );
  }

  const v = await resolveViewer(me);
  const [myQueries, notes] = await Promise.all([
    listMyTickets(v, "query"),
    listHrNotifications(me),
  ]);
  const unread = notes.filter((n) => !n.readAt).length;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-white">
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" className="pb-12">
        <header className="mb-8 flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Queries &amp; Notifications</h1>
          <NotificationInboxButton
            items={notes.map((note) => ({
              id: note.id,
              title: note.title,
              href: note.link,
              unread: !note.readAt,
              timeLabel: relTime(note.createdAt),
            }))}
          />
        </header>

        {/* THE COMPOSER RUNS FULL WIDTH. It used to be the left column of a
            two-column grid, which is what put 600px of empty aside beside it. */}
        <section>
          <DashboardSectionHeader
            icon={<SectionIcon icon={Send} tone="red" />}
            title="Ask HR a question"
            subtitle="Choose a topic, ask in one line, and add optional context."
            inset="px-0"
          />
          <div className="overflow-hidden rounded-section border border-hairline bg-surface-card shadow-sm">
          <div className="px-5 py-4 max-md:px-4">
            <TicketComposer mode="query" />
          </div>
          </div>
        </section>

        {/* The two lists, side by side, because they grow together. */}
        <div className="mt-8">
          <section>
            <DashboardSectionHeader
              icon={<SectionIcon icon={MessageCircleQuestion} tone="red" />}
              title="Your questions"
              subtitle="Filter by whether HR is handling it, needs something from you, or has resolved it."
              inset="px-0"
            />
            <QueriesBoard rows={myQueries} />
          </section>

          <aside className="hidden">
            {/* Same element, same classes, same margin as the heading on its
                left — so the two columns start on one line. */}
            <DashboardSectionHeader
              icon={<SectionIcon icon={BellRing} tone="red" />}
              title="Notifications"
              subtitle="Replies and updates from HR appear here."
              inset="px-0"
              actions={unread > 0 ? <span className="rounded-pill px-2 py-1 text-[11px] font-black text-white" style={{ background: RED }}>{unread} unread</span> : undefined}
            />
            {notes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-5 py-8 text-center">
                <BellRing size={20} className="mx-auto text-ink-subtle" aria-hidden />
                <p className="mt-2 text-[13.5px] font-semibold text-ink-strong">Nothing yet</p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">
                  When HR replies to a question, it shows up here.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {notes.map((n) => {
                  /* UNREAD IS CARRIED BY WEIGHT AND A DOT, not by fading the
                     read ones to 70%. Dimming makes read notices harder to
                     actually read, which is backwards — they are still the
                     record of what happened. */
                  const row = (
                    <div
                      className={`rounded-xl border bg-surface-card px-3.5 py-3 transition hover:border-[var(--color-altus-red)] ${
                        n.readAt ? "border-hairline" : "border-hairline-strong"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.readAt && (
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: RED }}
                            aria-label="Unread"
                          />
                        )}
                        <span
                          className={`text-[13px] text-ink-strong ${
                            n.readAt ? "font-medium" : "font-bold"
                          }`}
                        >
                          {n.title}
                        </span>
                      </div>
                      <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                        {relTime(n.createdAt)}
                      </span>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? <Link href={n.link as Route}>{row}</Link> : row}
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </PageShell>
    </div>
  );
}
