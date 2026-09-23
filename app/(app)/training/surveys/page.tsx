import Link from "next/link";
import type { Route } from "next";
import { MessageSquareText, Star } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canTrain } from "@/lib/training/roles";
import { listSessions } from "@/lib/queries/training-calendar";
import { surveyAggregate } from "@/lib/queries/surveys";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const FEEDBACK_STATUSES = ["done", "completed", "test_pending", "feedback_pending", "closed"];

export default async function TrainingSurveysPage() {
  const me = await requireWorkspace("training");
  const canManage = me.isAdmin || isSuperAdmin(me.email) || (await canTrain(me));
  const scope = me.isAdmin || isSuperAdmin(me.email)
    ? ({ kind: "all", meId: me.id } as const)
    : ({ kind: "downline", meId: me.id } as const);

  const sessions = await listSessions({ scope });
  const target = sessions.filter((s) => FEEDBACK_STATUSES.includes(s.status));

  const aggregates = await Promise.all(
    target.map(async (s) => ({ session: s, agg: await surveyAggregate(s.id) })),
  );

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <MessageSquareText size={13} strokeWidth={2.6} /> Feedback Surveys
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            Feedback Surveys
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Anonymous 1–5 surveys per completed training. Trainer sees aggregates only, never who said what.
          </p>
        </header>

        <div className="grid gap-3">
          {aggregates.map(({ session, agg }) => (
            <div key={session.id} className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/training/calendar/${session.id}` as Route} className="font-bold text-ink-strong hover:text-[var(--tc-deep)]" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
                  {session.topic}
                </Link>
                {agg && agg.responses > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-ink-soft">
                    <Star size={15} style={{ color: "#f59e0b" }} fill="#f59e0b" />
                    {agg.questions.reduce((s, q) => s + (q.average ?? 0), 0) / Math.max(1, agg.questions.length)} / 5
                    <span className="font-semibold text-ink-subtle">· {agg.responses} responses</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13.5px] font-semibold text-ink-subtle">
                {agg ? (agg.responses > 0 ? "Aggregate view below." : "Survey created — no responses yet.") : "No survey yet."}
              </p>
              <Link href={`/training/surveys/${session.id}` as Route} className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[var(--tc-deep)] hover:underline" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
                {canManage ? "Manage survey" : "Give feedback"} →
              </Link>
              {agg && agg.responses > 0 && (
                <div className="mt-3 grid gap-2">
                  {agg.questions.map((q) => (
                    <div key={q.questionId} className="flex items-center justify-between gap-3 rounded-lg bg-[rgba(15,23,42,0.03)] px-3 py-2 text-[13px]">
                      <span className="font-semibold text-ink-soft">{q.prompt}</span>
                      <span className="font-bold text-ink-strong">{q.average != null ? `${q.average} / 5` : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {aggregates.length === 0 && (
            <p className="text-ink-subtle">No completed trainings needing feedback yet.</p>
          )}
        </div>
      </main>
    </>
  );
}
