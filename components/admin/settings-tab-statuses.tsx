import { TASK_STATUSES, type TaskStatus } from "@/db/enums";
import type { StatusDisplayMap } from "@/lib/queries/status-display";
import { StatusRowEditor } from "./status-row-editor";

type Props = { display: StatusDisplayMap };

export function SettingsTabStatuses({ display }: Props) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-display-xs mb-2">Statuses</h2>
      <p className="text-body text-ink-subtle mb-6">
        Rename or recolor each status. The dashboard, emails, and integrations
        will reflect the change everywhere.
      </p>
      <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 backdrop-blur-sm">
        {TASK_STATUSES.map((s, i) => (
          <StatusRowEditor
            key={s}
            status={s as TaskStatus}
            initial={display[s as TaskStatus]}
            isLast={i === TASK_STATUSES.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
