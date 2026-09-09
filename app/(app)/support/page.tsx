import Link from "next/link";
import type { Route } from "next";
import { LifeBuoy, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { DashboardHeader } from "@/components/layout/header";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { hrSupportEnabled } from "@/lib/hr/flag";
import {
  resolveViewer,
  listMyTickets,
  listQueue,
  queueCounts,
  type QueueFilters,
} from "@/lib/queries/hr-support";
import { TicketList } from "@/components/hr/ticket-list/ticket-list";
import { QueueFilters as QueueFilterBar } from "@/components/hr/ticket-list/queue-filters";
import type { HrTicketStatus, HrTicketPriority, HrTicketCategory } from "@/db/enums";

export const dynamic = "force-dynamic";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function s(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SupportPage({ searchParams }: PageProps) {
  const me = await requireWorkspace("hr");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Help Desk"
        Icon={LifeBuoy}
        blurb="Get help from the HR desk - questions, requests and escalations, all tracked in one place. This section is being built."
      />
    );
  }

  const sp = await searchParams;
  const v = await resolveViewer(me);

  const filters: QueueFilters = {
    status: (s(sp.status) as QueueFilters["status"]) ?? "open",
    priority: s(sp.priority) as HrTicketPriority | undefined,
    category: s(sp.category) as HrTicketCategory | undefined,
    assignee: (s(sp.assignee) as QueueFilters["assignee"]) ?? "all",
    source: (s(sp.source) as QueueFilters["source"]) ?? "all",
  };

  const [queue, mine, counts] = await Promise.all([
    v.handler ? listQueue(v, filters) : Promise.resolve([]),
    listMyTickets(v),
    v.handler ? queueCounts(v) : Promise.resolve({ open: 0, mine: 0, unassigned: 0, breaching: 0 }),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        {/* Title moved into the frozen bar; the ticket counts it used to
            narrate are already on the filter chips below. */}
        <header className="mb-6 flex flex-wrap items-end justify-end gap-4 wg-rise">
          <Link
            href={"/support/new" as Route}
            className="inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Plus size={16} /> Raise a Ticket
          </Link>
        </header>

        {v.handler ? (
          <div className="space-y-8">
            <section className="space-y-3.5">
              <QueueFilterBar counts={counts} />
              <TicketList rows={queue} handlerView empty="No tickets match these filters." />
            </section>
            {mine.length > 0 && (
              <section>
                <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-muted">My own requests</h2>
                <TicketList rows={mine} handlerView={false} />
              </section>
            )}
          </div>
        ) : (
          <TicketList
            rows={mine}
            handlerView={false}
            empty="You haven't raised anything yet. Hit “Raise a ticket” when you need HR."
          />
        )}
      </main>
    </>
  );
}
