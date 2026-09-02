import { ListChecks, Image as ImageIcon } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listAccountsTasks, listAccountsScreenshots } from "@/lib/queries/accounts";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import {
  TaskListTable,
  ScreenshotsTable,
} from "@/components/accounts/task-list/task-list-client";
import { AccountsTaskImport } from "@/components/accounts/task-list/task-import";

export const dynamic = "force-dynamic";

export default async function AccountsTaskListPage() {
  await requireAccountsAccess();

  const [tasks, screenshots, taskStatus, taskGear, shotGear, shotFreq] =
    await Promise.all([
      listAccountsTasks(),
      listAccountsScreenshots(),
      listAccountsLookups("task_status"),
      listAccountsLookups("task_gear"),
      listAccountsLookups("shot_gear"),
      listAccountsLookups("shot_freq"),
    ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <header className="mt-3 mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>
              Accounts
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px, 3.4vw, 44px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
                marginTop: 6,
              }}
            >
              Accounts Task List
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              The working task tracker — area, status, target vs actual dates, with a Screenshots-to-Post sub-table.
            </p>
          </div>
          <div className="shrink-0 pt-1">
            <AccountsTaskImport />
          </div>
        </header>

        <div className="mb-5 flex items-center gap-2.5">
          <span
            className="inline-flex size-9 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}
          >
            <ListChecks size={18} strokeWidth={2.4} />
          </span>
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
            Task List
          </h2>
        </div>

        <TaskListTable rows={tasks} statusOptions={taskStatus} gearOptions={taskGear} />

        <div className="my-12 h-px" style={{ background: "var(--color-hairline)" }} />

        <div className="mb-5 flex items-center gap-2.5">
          <span
            className="inline-flex size-9 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}
          >
            <ImageIcon size={18} strokeWidth={2.4} />
          </span>
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
            Screenshots to Post
          </h2>
        </div>

        <ScreenshotsTable rows={screenshots} freqOptions={shotFreq} gearOptions={shotGear} />
      </main>
    </>
  );
}
