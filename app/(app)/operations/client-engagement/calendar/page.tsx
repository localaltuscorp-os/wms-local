import { UserX } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { buildCapacity } from "@/lib/client-engagement/grids";
import { listHhOverlay } from "@/lib/queries/client-engagement";
import { CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { CalendarView } from "@/components/client-engagement/calendar-view";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → CLIENT ENGAGEMENT → CALENDAR.
 *
 * `?member=` and `?week=` are in the URL, so a particular week of a particular
 * person is a link. Admins, super-admins, Manan and Ruchita may open anyone's;
 * everyone else sees their own, whatever the URL says.
 */
export default async function ClientEngagementCalendar({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await loadCePage(sp.week);

  if (!ctx.ready) {
    return (
      <PageShell width="full">
        <CeNotReady />
      </PageShell>
    );
  }

  const { members, accounts, engagements } = ctx.snapshot;
  const requested = members.find((m) => m.id === sp.member)?.id ?? null;
  const memberId = ctx.canViewAny ? (requested ?? ctx.myMemberId ?? members[0]?.id ?? null) : ctx.myMemberId;

  if (!memberId) {
    return (
      <PageShell width="full">
        <div className="rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center">
          <span
            className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
          >
            <UserX size={30} strokeWidth={2.2} />
          </span>
          <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
            {members.length ? "You are not on the Client Engagement team" : "No team members yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-[46ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
            {members.length
              ? `Your calendar appears once ${CE_MANAGER_NAMES} add you under Team & Log.`
              : `${CE_MANAGER_NAMES} add the team under Team & Log.`}
          </p>
        </div>
      </PageShell>
    );
  }

  const member = members.find((m) => m.id === memberId)!;
  const hhOverlay = member.employeeId ? await listHhOverlay(member.employeeId) : [];
  const capacity = buildCapacity(members, accounts, engagements, ctx.monday);
  const canEdit = ctx.canManage || memberId === ctx.myMemberId;

  return (
    <PageShell width="full">
      <CalendarView
        members={members}
        memberId={memberId}
        monday={ctx.monday}
        today={ctx.today}
        accounts={accounts}
        engagements={engagements.filter((e) => e.teamMemberId === memberId)}
        allEngagements={ctx.canViewAny ? engagements : []}
        hhOverlay={hhOverlay}
        capacity={capacity}
        canViewAny={ctx.canViewAny}
        canEdit={canEdit}
        canManage={ctx.canManage}
      />
    </PageShell>
  );
}
