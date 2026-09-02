import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getTestForAuthoring, getMaterial, isManager, TEST_PASS_MARK } from "@/lib/queries/training";
import { TestAuthor } from "@/components/training/test-author";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AuthorTestsPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireWorkspace("training");
  const canManage = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!canManage) redirect(`/training/${id}` as Route);

  const [material, t1, t2] = await Promise.all([
    getMaterial(id, me.id),
    getTestForAuthoring(id, 1),
    getTestForAuthoring(id, 2),
  ]);
  const title = material?.fileName || material?.subject || "material";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1000px]">
          <Link href={`/training/${id}` as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <ArrowLeft size={15} strokeWidth={2.4} /> {title}
          </Link>
          <header className="mt-3 mb-6">
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2.8vw, 38px)", letterSpacing: "-0.025em" }}>
              Manage Tests
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Test 1 is multiple-choice (pass 80%). Test 2 is fill-in-the-blank (pass 75%). Each save replaces that test's questions.
            </p>
          </header>
          <div className="flex flex-col gap-6">
            <TestAuthor materialId={id} kind={1} passMark={TEST_PASS_MARK[1]} initialQuestions={t1.questions} />
            <TestAuthor materialId={id} kind={2} passMark={TEST_PASS_MARK[2]} initialQuestions={t2.questions} />
          </div>
        </div>
      </main>
    </>
  );
}
