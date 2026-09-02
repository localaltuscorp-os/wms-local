import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listFeedback, feedbackStats } from "@/lib/queries/feedback";
import { FeedbackDashboard } from "@/components/training/feedback/feedback-dashboard";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  await requireWorkspace("training");
  const [rows, stats] = await Promise.all([listFeedback(), feedbackStats()]);
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={15} /> Training Centre</Link>
        <header className="mt-3 mb-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Feedback</span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 800, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 4 }}>Feedback Desk</h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>Client and internal feedback — escalate, resolve, sign off. 72-hour turn-around.</p>
        </header>
        <FeedbackDashboard rows={rows} stats={stats} canNew />
      </main>
    </>
  );
}
