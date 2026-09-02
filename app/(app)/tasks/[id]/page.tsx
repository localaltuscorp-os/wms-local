import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { TaskDetailLoader } from "@/components/tasks/task-detail-loader";
import { BufferingState } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { markTaskRead } from "@/app/(app)/tasks/read-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Task detail — Phase 1.2 streaming shell.
 *
 * Header + main container + footer render synchronously so the user sees
 * a chrome'd page in well under 100ms. The actual content lives behind a
 * `<Suspense>` boundary that the loader fills in once `getTaskById` and
 * the picker fan-outs settle. The five static picker queries are cached
 * (Phase 1.1) so on a warm cache the streamed payload arrives quickly
 * after the per-task readback.
 */
/**
 * Task ids are uuids. Without this guard `/tasks/<anything>` renders a detail
 * shell for a task that cannot exist — which is how `/tasks/agenda` kept
 * answering 200 after that page was deleted, instead of 404ing like a retired
 * route should.
 */
const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!TASK_ID.test(id)) notFound();
  // requireUser is already cached per-request (lib/auth/current uses
  // `cache()`); doing it here keeps auth-gating ahead of any rendering
  // and gives the loader its `me` payload without a second resolve.
  const me = await requireUser();

  // Read-receipt: mark this task read on first open by anyone. Fire-and-forget;
  // markTaskRead is best-effort and the NULL guard makes repeat opens a no-op.
  void markTaskRead(id);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="relative mx-auto w-full max-w-[1280px] px-6 max-md:px-4 pt-8 pb-20">
        {/* Ambient canvas wash — pure CSS, zero-cost depth behind the record. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
          style={{
            background:
              "radial-gradient(ellipse 44% 70% at 88% 0%, color-mix(in srgb, var(--color-altus-red) 5%, transparent), transparent 68%), radial-gradient(ellipse 36% 60% at 8% 4%, rgba(15, 23, 42, 0.03), transparent 62%)",
          }}
        />
        <Suspense key={id} fallback={<div className="flex min-h-[60vh] items-center justify-center"><BufferingState label="Loading task…" /></div>}>
          <TaskDetailLoader
            taskId={id}
            me={{
              id: me.id,
              email: me.email ?? null,
              name: me.name,
              avatarUrl: me.avatarUrl,
              department: me.department,
              isAdmin: me.isAdmin,
              isSuperAdmin: isSuperAdmin(me.email),
            }}
          />
        </Suspense>
      </main>
    </>
  );
}
