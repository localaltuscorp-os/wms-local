import Link from "next/link";
import type { Route } from "next";
import { Layers, LayoutDashboard } from "lucide-react";
import { loadMasterLinksForItems } from "@/lib/dcc/master-sync";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import { loadDccScope, canFillFor, canReviewFor, canManageItemsFor } from "@/lib/dcc/access";
import { listOwnerItems, listOwnerEntries, listDccPeople, listReviewsForOwners, listOwnerClients, listOwnerSubjects, listItemSubjectsForItems } from "@/lib/queries/dcc";
import { isoDate } from "@/lib/dcc/util";
import { localDateString } from "@/lib/format";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { checkDccItemDelete } from "@/lib/dcc/item-lock";
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
  // TODAY IS THE IST CALENDAR DAY. Entries lock at 11:59 pm IST (lib/dcc/entry-lock.ts),
  // and the server write path decides "today" in IST — a board whose "today" came
  // from the UTC server clock would show yesterday as open until 05:30 IST and then
  // have every save refused.
  const today = localDateString("Asia/Kolkata", now);
  const from = new Date(now);
  from.setDate(from.getDate() - 48); // ~7 weeks window for streaks/history
  const fromISO = isoDate(from);

  // The past-entry editor (Manan Sir) may change any employee's closed days.
  const canEditPast = canEditPastDccEntries(me.email);

  const [items, entries, people, reviews, clients, subjects] = await Promise.all([
    listOwnerItems(ownerId),
    listOwnerEntries(ownerId, fromISO),
    scope.isManager ? listDccPeople([...scope.visibleIds]) : Promise.resolve([]),
    canReviewFor(scope, ownerId) ? listReviewsForOwners([ownerId], fromISO) : Promise.resolve([]),
    listOwnerClients(ownerId),
    listOwnerSubjects(ownerId),
  ]);
  const [itemSubjects, masterLinks] = await Promise.all([
    listItemSubjectsForItems(items.filter((i) => i.isParticipantList).map((i) => i.id)),
    loadMasterLinksForItems(items.map((i) => i.id)),
  ]);

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
            // Everyone: the dashboard now shows each viewer their own scope —
            // themselves, their team, or the company.
            <>
              <Link
                href={"/dcc/masters" as Route}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <Layers size={14} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                DCC Master
              </Link>
              <Link
                href={"/dcc/dashboard" as Route}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <LayoutDashboard size={14} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                Dashboard
              </Link>
            </>
          }
        />

        <DccBoard
          ownerId={ownerId}
          ownerName={owner.name}
          meId={me.id}
          canFill={canFillFor(scope, ownerId) || canEditPast}
          canEditPast={canEditPast}
          canReview={canReviewFor(scope, ownerId)}
          canManage={canManageItemsFor(scope, ownerId)}
          people={scope.isManager ? people : []}
          items={items.map(({ createdByEmail, ...it }) => ({
            ...it,
            // Hide Delete on a KPI Manan Sir gave, for everyone but him. The
            // delete action refuses it regardless (lib/dcc/item-lock.ts).
            deleteLocked: !checkDccItemDelete({ actorEmail: me.email, creatorEmail: createdByEmail }).ok,
            // Master KPIs are changed in DCC Master, not on the board.
            masterDesignation: masterLinks.get(it.id) ?? null,
          }))}
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
