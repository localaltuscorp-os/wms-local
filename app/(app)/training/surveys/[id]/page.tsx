import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { canManageTraining } from "@/lib/training/roles";
import { getSurveyForSession, surveyAggregate, hasResponded } from "@/lib/queries/surveys";
import { getSession } from "@/lib/queries/training-calendar";
import { SurveyPanel } from "@/components/training/surveys/survey-panel";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SurveyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireWorkspace("training");
  const canManage = await canManageTraining(me);

  const [session, survey, aggregate] = await Promise.all([
    getSession(id),
    getSurveyForSession(id),
    surveyAggregate(id),
  ]);
  if (!session) notFound();

  const responded = survey ? await hasResponded(survey.id, me.id) : false;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training/surveys" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-[var(--tc-deep)]" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
          <ArrowLeft size={15} /> Feedback Surveys
        </Link>

        <header className="mt-3 mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <MessageSquareText size={13} strokeWidth={2.6} /> {session.topic}
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            {canManage ? "Manage Survey" : "Give Feedback"}
          </h1>
        </header>

        <div className="max-w-2xl">
          <SurveyPanel sessionId={id} survey={survey} aggregate={aggregate} canManage={canManage} hasResponded={responded} />
        </div>
      </main>
    </>
  );
}
