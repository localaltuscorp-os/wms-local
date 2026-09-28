import { CalendarPlus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { canManageTraining } from "@/lib/training/roles";
import { listTcSubjects, listDepartmentOptions } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getScoreConfig } from "@/lib/queries/pms";
import { ScheduleTraining } from "@/components/training/schedule/schedule-training";
import { addSessionSubject } from "@/app/(app)/training/calendar/actions";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function ScheduleTrainingPage() {
  const me = await requireWorkspace("training");
  const canManage = await canManageTraining(me);

  const [subjects, employeeOptions, functions, cfg] = await Promise.all([
    listTcSubjects(),
    listEmployeeOptions(),
    listDepartmentOptions(),
    getScoreConfig(),
  ]);

  const maxSessionMinutes = cfg.thresholds.maxSessionMinutes || 90;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <CalendarPlus size={13} strokeWidth={2.6} /> Schedule Training
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            Schedule Training
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Pick an audience, trainer and recurrence. Every training needs a learning outcome statement.
          </p>
        </header>

        {canManage ? (
          <div className="max-w-3xl">
            <ScheduleTraining
              subjectOptions={subjects}
              employeeOptions={employeeOptions}
              functionOptions={functions.map((f) => ({ id: f.value, name: f.label }))}
              maxSessionMinutes={maxSessionMinutes}
              onAddSubject={addSessionSubject}
            />
          </div>
        ) : (
          <p className="text-ink-muted">Only trainers (Team Leads, Managers or Manan) can schedule a training.</p>
        )}
      </main>
    </>
  );
}
