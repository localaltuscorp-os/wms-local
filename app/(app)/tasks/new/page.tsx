import { DashboardHeader } from "@/components/layout/header";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import { getTaskById } from "@/lib/queries/tasks";
import { requireUser } from "@/lib/auth/current";
import { canAddTaskRoster } from "@/lib/auth/roster-permission";
import { withRetry } from "@/lib/db/with-timeout";
import type { TaskPriority } from "@/db/enums";

export const dynamic = "force-dynamic";

// The option rosters load on a cold serverless request — the query most likely
// to grab a stale pooled connection ("That didn't go through"). Retry on a fresh
// connection so a single dead socket never crashes the whole create page.
const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

interface PageProps {
  searchParams: Promise<{ from?: string; doer?: string }>;
}

export default async function NewTaskPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const { from, doer } = await searchParams;
  const [all, clients, subjects, projectNodes] = await Promise.all([
    withRetry(() => listEmployees(), { ...RETRY, label: "nt-employees" }),
    withRetry(() => listActiveClientNames(), { ...RETRY, label: "nt-clients" }),
    withRetry(() => listActiveSubjectNames(), { ...RETRY, label: "nt-subjects" }),
    withRetry(() => listProjectNodeOptions(), { ...RETRY, label: "nt-projects" }),
  ]);
  const options = all.map((e) => ({ id: e.id, name: e.name }));

  // Duplicate flow: prefill the form from an existing task (?from=<id>).
  let defaults: {
    initiatorId: string;
    doerId?: string;
    priority?: TaskPriority;
    title?: string;
    subject?: string;
    description?: string;
    notes?: string;
    projectNodeId?: string;
  } = { initiatorId: me.id };
  // #11 gate "Assign" deep-link: prefill the doer (the report being assigned).
  if (doer && options.some((o) => o.id === doer)) {
    defaults.doerId = doer;
  }
  if (from) {
    const src = await withRetry(() => getTaskById(from), { ...RETRY, label: "nt-from" });
    if (src) {
      defaults = {
        initiatorId: src.initiatorId,
        doerId: src.doerId,
        priority: src.priority,
        title: src.title,
        subject: src.subject ?? undefined,
        description: src.description ?? undefined,
        notes: src.notes ?? undefined,
        projectNodeId: src.projectNodeId ?? undefined,
      };
    }
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="relative mx-auto w-full max-w-[880px] px-6 max-md:px-4 pt-10 pb-20">
        {/* Ambient canvas wash behind the composer — pure CSS depth. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px]"
          style={{
            background:
              "radial-gradient(ellipse 46% 75% at 90% 0%, color-mix(in srgb, var(--color-altus-red) 5%, transparent), transparent 68%), radial-gradient(ellipse 36% 60% at 6% 6%, rgba(15, 23, 42, 0.03), transparent 62%)",
          }}
        />
        <header className="wg-rise mb-7">
          <p
            className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--color-altus-red-deep)" }}
          >
            <span
              aria-hidden
              className="inline-block h-[3px] w-6 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
              }}
            />
            Work Management · Create
          </p>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(32px, 4.2vw, 44px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.02,
            }}
          >
            New Task
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2">
            Create a task and assign it to a doer. The initiator approves it
            once it's done.
          </p>
        </header>
        <div
          className="wg-rise relative overflow-hidden bg-surface-card rounded-section border border-hairline p-8 max-md:p-5"
          style={{
            boxShadow:
              "0 1px 3px rgba(15, 23, 42, 0.04), 0 24px 56px -32px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
            animationDelay: "60ms",
          }}
        >
          {/* Brand accent strip + soft aurora wash. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{
              background:
                "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-altus-red-deep) 42%, transparent 100%)",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: "inherit",
              background:
                "radial-gradient(ellipse 50% 30% at 100% 0%, color-mix(in srgb, var(--color-altus-red) 4%, transparent), transparent 70%)",
            }}
          />
          <NewTaskForm
            employees={options}
            clients={clients}
            subjects={subjects}
            projectNodes={projectNodes}
            canAddRoster={canAddTaskRoster(me)}
            defaults={defaults}
          />
        </div>
      </main>
    </>
  );
}
