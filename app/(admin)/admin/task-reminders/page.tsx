import { asc } from "drizzle-orm";
import { BellRing } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { taskReminderRules } from "@/db/schema";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { AdminSection } from "@/components/admin/ui/section-shell";
import {
  TaskReminderRules,
  type ReminderRuleView,
} from "@/components/admin/task-reminder-rules";

export const dynamic = "force-dynamic";

/**
 * Task Reminder Settings — admin-authored daily reminder rules.
 *
 * Each rule names its recipients, its employee scope, the statuses that count
 * and its own send time. The dispatcher (app/api/cron/task-reminders) polls
 * every 15 minutes and sends ONE consolidated email per recipient, grouped by
 * employee.
 */
export default async function TaskRemindersPage() {
  await requireAdmin();

  const [rows, employees] = await Promise.all([
    db.select().from(taskReminderRules).orderBy(asc(taskReminderRules.sendTimeIst)),
    listEmployeeOptions(),
  ]);

  const rules: ReminderRuleView[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isEnabled: r.isEnabled,
    recipientIds: r.recipientIds ?? [],
    scope: r.scope,
    employeeIds: r.employeeIds ?? [],
    statuses: r.statuses ?? [],
    sendTimeIst: r.sendTimeIst,
    lastSentOn: r.lastSentOn,
    lastError: r.lastError,
  }));

  const activeCount = rules.filter((r) => r.isEnabled).length;

  return (
    <AdminSection
      eyebrow="Admin · System"
      title="Task Reminders"
      subtitle="Daily emails chasing open tasks — one consolidated mail per recipient, grouped by employee."
      icon={BellRing}
      stats={[
        { label: "Rules", value: rules.length },
        { label: "Active", value: activeCount, tone: "green" },
      ]}
    >
      <TaskReminderRules
        rules={rules}
        employees={employees.map((e) => ({ value: e.id, label: e.name }))}
      />
    </AdminSection>
  );
}
