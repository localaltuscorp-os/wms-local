import Link from "next/link";
import type { Route } from "next";
import { MonitorOff, Users, Camera, Clock, ShieldAlert } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  WorkSessionReviewClient,
  type ReviewSession,
  type ReviewShot,
  type ReviewFlag,
} from "@/components/attendance/work-session-review-client";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listProjectRemoteEmployeesWithSessionStats,
  listSessionsForEmployee,
  getSessionWithShots,
  signShotPaths,
  type ProjectRemoteEmployeeStat,
} from "@/lib/queries/work-sessions";
import type { WorkSession, WorkSessionShot } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Screenshots should arrive ~every 5 min; a gap past this reads as "went dark". */
const LONG_GAP_MINUTES = 12;

/** Simple "this isn't for you / isn't on" panel — no review UI is rendered. */
function NotAvailable({ note }: { note: string }) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <div
          className="wg-rise mx-auto mt-8 flex max-w-[520px] flex-col items-center gap-3 rounded-[22px] bg-surface-card px-6 py-10 text-center"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
        >
          <span
            className="inline-grid size-12 place-items-center rounded-2xl"
            style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
          >
            <MonitorOff size={22} strokeWidth={2.2} />
          </span>
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}
          >
            Work session review
          </h1>
          <p className="text-[13.5px] font-medium text-ink-subtle">{note}</p>
        </div>
      </PageShell>
    </>
  );
}

/** End instant used for duration / overlap math — real end, or "now" if still open. */
function endMs(s: WorkSession): number {
  return (s.endedAt ?? new Date()).getTime();
}

/** Human "Xh YYm" from minutes, matching the capture page's formatting. */
function fmtHours(min: number | null): string {
  if (min == null) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Accountability flags for one capture session (never applies to Meet rows). */
function captureFlags(session: WorkSession, shots: WorkSessionShot[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (session.source !== "capture") return flags;

  // 0 screenshots on a session that has already closed = no proof of work.
  if (session.status !== "open" && shots.length === 0) {
    flags.push({ label: "No screenshots", tone: "alert" });
  }

  // Longest silent stretch between consecutive frames.
  let maxGapMs = 0;
  for (let i = 1; i < shots.length; i++) {
    const gap = shots[i]!.takenAt.getTime() - shots[i - 1]!.takenAt.getTime();
    if (gap > maxGapMs) maxGapMs = gap;
  }
  if (shots.length > 0) {
    const maxGapMin = Math.round(maxGapMs / 60000);
    if (maxGapMin >= LONG_GAP_MINUTES) {
      flags.push({ label: `${maxGapMin} min gap`, tone: "warn" });
    }
  }
  return flags;
}

/**
 * Does this session's time window overlap ANY session of the other source? A
 * matching Meet + capture pair is the expected "proof from both angles"; the
 * note surfaces the difference in logged minutes so a reviewer can spot a
 * capture that ran much shorter than the Meet it should mirror.
 */
function overlapNote(session: WorkSession, all: WorkSession[]): string | null {
  const aStart = session.startedAt.getTime();
  const aEnd = endMs(session);
  const other = session.source === "capture" ? "meet" : "capture";
  for (const b of all) {
    if (b.id === session.id || b.source !== other) continue;
    const bStart = b.startedAt.getTime();
    const bEnd = endMs(b);
    if (aStart < bEnd && bStart < aEnd) {
      const otherLabel = other === "meet" ? "Meet" : "Capture";
      const deltaMin = Math.round(Math.abs((aEnd - aStart) - (bEnd - bStart)) / 60000);
      return deltaMin >= 5
        ? `Overlaps a ${otherLabel} session (±${deltaMin} min)`
        : `Overlaps a ${otherLabel} session`;
    }
  }
  return null;
}

function PersonRow({
  person,
  selected,
  href,
}: {
  person: ProjectRemoteEmployeeStat;
  selected: boolean;
  href: Route;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors focus:outline-none focus-visible:ring-2"
      style={
        selected
          ? { background: "color-mix(in srgb, #E10600 8%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, #E10600 26%, transparent)" }
          : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", background: "var(--color-surface-soft)" }
      }
    >
      <EmployeeAvatar name={person.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold text-ink-strong">{person.name}</div>
        <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink-subtle">
          <span>{person.sessionCount} session{person.sessionCount === 1 ? "" : "s"}</span>
          <span aria-hidden>·</span>
          <span>{fmtHours(person.totalHours * 60)}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function WorkSessionReviewPage({ searchParams }: PageProps) {
  const me = await requireUser();
  // Same trust boundary the attendance Team roster uses (super-admin), widened
  // to any admin so a manager can review their remote staff. Everyone else is
  // shown the neutral "not available" panel rather than a hard 403.
  if (!isSuperAdmin(me.email) && !me.isAdmin) {
    return <NotAvailable note="Work session review is for managers and administrators." />;
  }

  const sp = await searchParams;
  const people = await listProjectRemoteEmployeesWithSessionStats();

  const requestedEmp = typeof sp.emp === "string" ? sp.emp : undefined;
  const selected =
    people.find((p) => p.id === requestedEmp) ?? people[0] ?? null;

  // Assemble the selected person's sessions with signed screenshots + flags.
  let sessions: ReviewSession[] = [];
  if (selected) {
    const raw = await listSessionsForEmployee(selected.id, { limit: 60 });

    // Pull shots only for capture sessions, then batch-sign every path at once.
    const captureRows = raw.filter((s) => s.source === "capture");
    const withShots = await Promise.all(
      captureRows.map((s) => getSessionWithShots(s.id)),
    );
    const shotsBySession = new Map<string, WorkSessionShot[]>();
    for (const w of withShots) {
      if (w) shotsBySession.set(w.session.id, w.shots);
    }
    const urlMap = await signShotPaths(
      [...shotsBySession.values()].flat().map((sh) => sh.path),
    );

    sessions = raw.map((s): ReviewSession => {
      const shots = shotsBySession.get(s.id) ?? [];
      const reviewShots: ReviewShot[] = shots.map((sh) => ({
        id: sh.id,
        takenAt: sh.takenAt.toISOString(),
        url: urlMap.get(sh.path) ?? null,
      }));
      return {
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        source: s.source,
        status: s.status,
        totalMinutes: s.totalMinutes == null ? null : Number(s.totalMinutes),
        screenshotCount: s.screenshotCount,
        meetConferenceRecord: s.meetConferenceRecord,
        flags: captureFlags(s, shots),
        overlapNote: overlapNote(s, raw),
        shots: reviewShots,
      };
    });
  }

  const totalPeople = people.length;
  const totalSessions = people.reduce((n, p) => n + p.sessionCount, 0);

  function personHref(id: string): Route {
    return `/attendance/work-session/review?emp=${id}` as Route;
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <header className="mb-5 wg-rise">
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(22px,2.6vw,32px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Work session review
          </h1>
          <p className="mt-1 text-[13.5px] font-medium text-ink-subtle">
            Project / remote work sessions from the last 30 days - Meet joins and screen-share captures, with screenshot proof.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-ink-subtle">
            <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1" style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              <Users size={13} strokeWidth={2.4} /> {totalPeople} remote worker{totalPeople === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1" style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              <Clock size={13} strokeWidth={2.4} /> {totalSessions} session{totalSessions === 1 ? "" : "s"}
            </span>
          </div>
        </header>

        {totalPeople === 0 ? (
          <div
            className="wg-rise rounded-[22px] bg-surface-card px-6 py-10 text-center"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
          >
            <span
              className="mx-auto mb-3 inline-grid size-11 place-items-center rounded-2xl"
              style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
            >
              <Camera size={20} strokeWidth={2.2} />
            </span>
            <p className="text-[13.5px] font-medium text-ink-subtle">
              No project / remote workers yet. Set an employee&apos;s employee type to &quot;project remote&quot; to start logging sessions.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* People list */}
            <aside
              className="wg-rise h-max rounded-[22px] bg-surface-card p-3 max-md:p-2.5"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
            >
              <h2
                className="px-1.5 pb-2 pt-1 text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: "-0.01em" }}
              >
                Remote workers
              </h2>
              <nav className="flex flex-col gap-1.5">
                {people.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    selected={selected?.id === p.id}
                    href={personHref(p.id)}
                  />
                ))}
              </nav>
            </aside>

            {/* Sessions for the selected person */}
            <section>
              {selected && (
                <div className="mb-3 flex items-center gap-3">
                  <EmployeeAvatar name={selected.name} size="md" />
                  <div>
                    <div className="text-[16px] font-black tracking-[-0.01em] text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
                      {selected.name}
                    </div>
                    <div className="text-[12px] font-medium text-ink-subtle">
                      {selected.sessionCount} session{selected.sessionCount === 1 ? "" : "s"} · {fmtHours(selected.totalHours * 60)} in the last 30 days
                    </div>
                  </div>
                </div>
              )}
              {selected ? (
                <WorkSessionReviewClient personName={selected.name} sessions={sessions} />
              ) : (
                <div
                  className="wg-rise rounded-[22px] bg-surface-card px-6 py-10 text-center"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
                >
                  <ShieldAlert size={20} className="mx-auto mb-2 text-ink-subtle" />
                  <p className="text-[13.5px] font-medium text-ink-subtle">Pick a remote worker to review their sessions.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </PageShell>
    </>
  );
}
