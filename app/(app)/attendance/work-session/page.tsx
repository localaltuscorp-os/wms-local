import { MonitorOff } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import {
  WorkSessionClient,
  type RecentSession,
} from "@/components/attendance/work-session-client";
import { requireUser } from "@/lib/auth/current";
import { asWorkerType } from "@/lib/attendance/worker-type";
import { listSessionsForEmployee } from "@/lib/queries/work-sessions";

export const dynamic = "force-dynamic";

/** Simple "this isn't for you / isn't on" panel — no capture UI is rendered. */
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
            Work sessions
          </h1>
          <p className="text-[13.5px] font-medium text-ink-subtle">{note}</p>
        </div>
      </PageShell>
    </>
  );
}

export default async function WorkSessionPage() {
  const me = await requireUser();

  if (asWorkerType(me.workerType) !== "project_remote") {
    return <NotAvailable note="Work sessions are only for project / remote staff." />;
  }

  const sessions = await listSessionsForEmployee(me.id, { limit: 20 });
  const recentSessions: RecentSession[] = sessions.map((s) => ({
    id: s.id,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    totalMinutes: s.totalMinutes == null ? null : Number(s.totalMinutes),
    screenshotCount: s.screenshotCount,
    status: s.status,
  }));

  const firstName = me.name.split(" ")[0] ?? me.name;

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
            Work sessions, {firstName}
          </h1>
          <p className="mt-1 text-[13.5px] font-medium text-ink-subtle">
            Share your screen to log project work — we capture a screenshot every 5 minutes as proof of the session.
          </p>
        </header>

        <div className="max-w-[560px]">
          <WorkSessionClient recentSessions={recentSessions} />
        </div>
      </PageShell>
    </>
  );
}
