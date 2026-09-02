import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getFeedback } from "@/lib/queries/feedback";
import { isManager } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { FeedbackDetailView } from "@/components/training/feedback/feedback-detail";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function FeedbackDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireWorkspace("training");
  const [fb, emps, manager] = await Promise.all([getFeedback(id), listEmployeeOptions(), isManager(me.id)]);
  if (!fb) notFound();
  const canManage = me.isAdmin || isSuperAdmin(me.email) || manager;
  const employees = emps.map((e) => ({ id: e.id, name: e.name }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training/feedback" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={15} /> Feedback Desk</Link>
        <header className="mt-3 mb-6">
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 800, fontSize: "clamp(26px, 2.8vw, 38px)", letterSpacing: "-0.025em" }}>{fb.ratedName}</h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15 }}>{fb.feedbackDate}{fb.clientName ? ` · ${fb.clientName}` : ""}</p>
        </header>
        <FeedbackDetailView fb={fb} canManage={canManage} employees={employees} />
      </main>
    </>
  );
}
