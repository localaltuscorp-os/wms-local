import type { PlanRow } from "@/components/project-plan/plan-board";
import type { PlanKind } from "@/lib/project-plan/levels";

/**
 * A plan made of nothing — no database, no auth, no network.
 *
 * This exists so the Project Views tree can be LOOKED AT while the real data
 * source is unavailable. It is deliberately hand-written rather than a dump of
 * live rows: a fixture that never changes is what makes "did that spacing
 * change?" answerable, and there is nothing here anyone could mistake for a
 * customer's plan.
 *
 * It is shaped to exercise the cases the screen has to get right:
 *
 *   · all five levels, so every indent step and every REF format appears
 *     (P1 / M1 / RA / A1 / SA1.1)
 *   · containers AND executable rows, so the Progress / Children columns and
 *     the Start / End / Duration / Task columns are both populated
 *   · an executable row WITH a task and one WITHOUT, so "Not scheduled" shows
 *   · a running timer, so that control is not always in its resting state
 *   · a milestone with no results, so an empty branch renders as a leaf
 *   · a second project, so the roots are not a single row
 */

let seq = 0;
const id = (): string => `preview-${++seq}`;

interface Draft {
  name: string;
  kind: PlanKind;
  status?: string | null;
  progressPercent?: number | null;
  targetDate?: string | null;
  durationMinutes?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  ownerName?: string | null;
  task?: Partial<NonNullable<PlanRow["task"]>> | null;
  children?: Draft[];
}

function build(d: Draft, parentId: string | null): PlanRow {
  const own = id();
  return {
    id: own,
    name: d.name,
    description: null,
    notes: null,
    kind: d.kind,
    parentId,
    status: d.status ?? null,
    approvalStatus: null,
    progressPercent: d.progressPercent ?? null,
    priority: null,
    links: [],
    targetDate: d.targetDate ?? null,
    durationMinutes: d.durationMinutes ?? null,
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    ownerId: d.ownerName ? `owner-${own}` : null,
    ownerName: d.ownerName ?? null,
    task: d.task
      ? {
          id: `task-${own}`,
          status: "initiated",
          statusLabel: "Initiated",
          doerId: "preview-viewer",
          doerName: "Preview User",
          priority: "imp_not_urgent",
          updatedAt: "2026-09-01T09:00:00.000Z",
          onCalendar: false,
          timerRunning: false,
          client: null,
          subject: null,
          notes: null,
          createdAt: "2026-08-20T09:00:00.000Z",
          dueAt: "2026-09-30T09:00:00.000Z",
          ...d.task,
        }
      : null,
    children: (d.children ?? []).map((c) => build(c, own)),
  };
}

const DRAFT: Draft[] = [
  {
    name: "AICL WMS Rollout",
    kind: "project",
    status: "initiated",
    progressPercent: 35,
    targetDate: "2026-12-31",
    startsAt: "2026-08-01T04:00:00.000Z",
    endsAt: "2026-12-31T13:00:00.000Z",
    ownerName: "Project Owner",
    children: [
      {
        name: "ATTENDANCE",
        kind: "milestone",
        status: "initiated",
        progressPercent: 50,
        targetDate: "2026-10-15",
        children: [
          {
            name: "Biometric feed live on every site",
            kind: "result",
            status: "initiated",
            progressPercent: 40,
            targetDate: "2026-10-01",
            children: [
              {
                name: "Shortlist and demo three vendors",
                kind: "action",
                targetDate: "2026-09-12",
                durationMinutes: 150,
                startsAt: "2026-09-12T04:30:00.000Z",
                endsAt: "2026-09-12T07:00:00.000Z",
                ownerName: "Preview User",
                task: { status: "done", statusLabel: "Done" },
              },
              {
                name: "Install readers at Plant 2",
                kind: "action",
                targetDate: "2026-09-24",
                durationMinutes: 480,
                startsAt: "2026-09-24T03:30:00.000Z",
                endsAt: "2026-09-24T11:30:00.000Z",
                ownerName: "Preview User",
                // Running, so the Start/Stop control shows its active state.
                task: { status: "initiated", statusLabel: "Initiated", timerRunning: true },
                children: [
                  {
                    name: "Site survey and cable route",
                    kind: "sub_action",
                    targetDate: "2026-09-18",
                    durationMinutes: 120,
                    startsAt: "2026-09-18T05:00:00.000Z",
                    endsAt: "2026-09-18T07:00:00.000Z",
                    task: { status: "follow_up", statusLabel: "Follow Up" },
                  },
                  {
                    // No task: this is the row that must read "Not scheduled".
                    name: "Raise the cabling PO",
                    kind: "sub_action",
                    targetDate: "2026-09-20",
                    task: null,
                  },
                ],
              },
            ],
          },
          {
            name: "Muster register retired",
            kind: "result",
            status: "not_started",
            targetDate: "2026-11-10",
          },
        ],
      },
      {
        // An empty container — it must render as a leaf, not a broken chevron.
        name: "PAYROLL",
        kind: "milestone",
        status: "not_started",
        targetDate: "2026-12-01",
      },
    ],
  },
  {
    name: "Vendor Portal",
    kind: "project",
    status: "not_started",
    targetDate: "2027-03-31",
    children: [
      {
        name: "KICK-OFF",
        kind: "milestone",
        status: "not_started",
        targetDate: "2026-10-05",
        children: [
          {
            name: "Scope signed off by both sides",
            kind: "result",
            status: "not_started",
            targetDate: "2026-10-05",
          },
        ],
      },
    ],
  },
];

export const SAMPLE_PLAN: PlanRow[] = DRAFT.map((d) => build(d, null));

/** A couple of rows carry files, so that column is not uniformly empty. */
export const SAMPLE_ATTACHMENT_COUNTS: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  const walk = (rows: PlanRow[]): void => {
    for (const r of rows) {
      if (r.kind === "result") out[r.id] = 2;
      if (r.kind === "action") out[r.id] = 1;
      walk(r.children);
    }
  };
  walk(SAMPLE_PLAN);
  return out;
})();
