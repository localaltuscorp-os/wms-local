import Link from "next/link";
import type { Route } from "next";
import { LayoutDashboard } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import { loadDccScope, canFillFor, canReviewFor, canManageItemsFor } from "@/lib/dcc/access";
import { listOwnerItems, listOwnerEntries, listDccPeople, listReviewsForOwners, listOwnerClients, listOwnerSubjects, listItemSubjectsForItems } from "@/lib/queries/dcc";
import { isoDate } from "@/lib/dcc/util";
import { DccBoard } from "@/components/dcc/dcc-board";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DccPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const scope = await loadDccScope(me);
  const sp = await searchParams;

  // Whose board are we viewing? Default = me. Managers/super can switch via ?emp.
  const requested = typeof sp.emp === "string" ? sp.emp : null;
  const ownerId = requested && scope.visibleIds.has(requested) ? requested : me.id;

  const now = new Date();
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 48); // ~7 weeks window for streaks/history
  const fromISO = isoDate(from);

  const [items, entries, people, reviews, clients, subjects] = await Promise.all([
    listOwnerItems(ownerId),
    listOwnerEntries(ownerId, fromISO),
    scope.isManager ? listDccPeople([...scope.visibleIds]) : Promise.resolve([]),
    canReviewFor(scope, ownerId) ? listReviewsForOwners([ownerId], fromISO) : Promise.resolve([]),
    listOwnerClients(ownerId),
    listOwnerSubjects(ownerId),
  ]);
  const itemSubjects = await listItemSubjectsForItems(items.filter((i) => i.isParticipantList).map((i) => i.id));

  const owner = people.find((p) => p.id === ownerId) ?? { id: me.id, name: me.name, avatarUrl: me.avatarUrl, department: me.department };

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 pt-6 pb-8 max-lg:px-6 max-md:px-4 max-md:pt-5 max-md:pb-6">
        {/* The green "EMPLOYEES · DCC" pill is gone with every other module
            badge; whose KPIs you are looking at becomes the inline hint, which
            is the one thing here that changes per view. */}
        <PageCommandBar
          title="Daily Compliance"
          hint={ownerId !== me.id ? `${owner.name}'s KPIs` : undefined}
          actions={
            scope.isManager ? (
              <Link
                href={"/dcc/dashboard" as Route}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <LayoutDashboard size={14} strokeWidth={2.2} style={{ color: "#16a34a" }} />
                {scope.isSuper ? "Dashboard" : "My Team"}
              </Link>
            ) : undefined
          }
        />

        <DccBoard
          ownerId={ownerId}
          ownerName={owner.name}
          meId={me.id}
          canFill={canFillFor(scope, ownerId)}
          canReview={canReviewFor(scope, ownerId)}
          canManage={canManageItemsFor(scope, ownerId)}
          people={scope.isManager ? people : []}
          items={items}
          entries={entries}
          reviews={reviews}
          clients={clients}
          subjects={subjects}
          itemSubjects={itemSubjects}
          today={today}
        />
      </main>
    </>
  );
}
