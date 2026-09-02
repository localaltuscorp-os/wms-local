import {
  Chip,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
  taskUrl,
} from "./_notification-layout";
import { formatDate, STATUS_LABELS_FALLBACK } from "@/lib/format";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskPriority, TaskStatus } from "@/db/enums";

export interface TaskReminderTaskLine {
  id: string;
  title: string;
  dueAt: Date;
  priority: TaskPriority;
  status: TaskStatus;
  isOverdue: boolean;
}

export interface TaskReminderGroup {
  employeeId: string;
  employeeName: string;
  tasks: TaskReminderTaskLine[];
}

export interface TaskReminderDigestProps {
  recipientName: string;
  /** The rule's name — an admin may run several, so the mail says which. */
  ruleName: string;
  groups: TaskReminderGroup[];
  siteUrl: string;
  totalTasks: number;
}

export const previewText = (p: Pick<TaskReminderDigestProps, "totalTasks" | "groups">) =>
  `${p.totalTasks} open task${p.totalTasks === 1 ? "" : "s"} across ${p.groups.length} ${
    p.groups.length === 1 ? "person" : "people"
  }`;

/** Critical and Important lead the eye; the other two stay quiet. */
function priorityTone(p: TaskPriority): "red" | "amber" | "blue" {
  if (p === "imp_urgent") return "red";
  if (p === "imp_not_urgent") return "amber";
  return "blue";
}

/**
 * ONE consolidated reminder per recipient, grouped by employee.
 *
 * Deliberately not one mail per task: a rule covering thirty people would
 * otherwise land as hundreds of separate mails a day and be filtered away
 * within a week. One mail, one table per person, is a thing somebody actually
 * reads over a coffee.
 */
export function TaskReminderDigestEmail(props: TaskReminderDigestProps) {
  const people = props.groups.length;

  return (
    <NotificationEmailLayout
      preview={previewText({ totalTasks: props.totalTasks, groups: props.groups })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>
        {props.totalTasks} open task{props.totalTasks === 1 ? "" : "s"} across {people}{" "}
        {people === 1 ? "person" : "people"}.
      </NotificationHeadline>
      <NotificationParagraph>
        This is the <strong>{props.ruleName}</strong> reminder. Tasks are grouped by the
        person they are assigned to, oldest due date first. Tap any row to open the task.
      </NotificationParagraph>

      {props.groups.map((group) => (
        <div key={group.employeeId} style={{ margin: "22px 0 0" }}>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 14,
              fontWeight: 700,
              color: "#0F172A",
            }}
          >
            {group.employeeName}{" "}
            <span style={{ color: "#64748B", fontWeight: 500 }}>
              · {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
            </span>
          </p>

          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            style={{
              width: "100%",
              borderCollapse: "collapse",
              margin: "0 0 8px",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Task</th>
                <th style={{ ...thStyle, width: 96 }}>Status</th>
                <th style={{ ...thStyle, width: 84 }}>Priority</th>
                <th style={{ ...thStyle, width: 84, textAlign: "right" }}>Due</th>
              </tr>
            </thead>
            <tbody>
              {group.tasks.map((t) => (
                <tr key={t.id}>
                  <td style={tdStyle}>
                    <a
                      href={taskUrl(props.siteUrl, t.id)}
                      style={{
                        color: "#0F172A",
                        fontWeight: 600,
                        textDecoration: "none",
                        lineHeight: 1.4,
                      }}
                    >
                      {t.title}
                    </a>
                  </td>
                  <td style={tdStyle}>
                    <Chip tone="blue">
                      {STATUS_LABELS_FALLBACK[t.status] ?? t.status}
                    </Chip>
                  </td>
                  <td style={tdStyle}>
                    <Chip tone={priorityTone(t.priority)}>
                      {PRIORITY_LABELS[t.priority] ?? t.priority}
                    </Chip>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: t.isOverdue ? "#B91C1C" : "#64748B",
                      fontWeight: t.isOverdue ? 700 : 400,
                    }}
                  >
                    {formatDate(t.dueAt)}
                    {t.isOverdue && (
                      <span style={{ display: "block", fontSize: 11 }}>overdue</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ textAlign: "center", margin: "26px 0 4px" }}>
        <a
          href={`${stripTrailingSlash(props.siteUrl)}/tasks`}
          style={{
            display: "inline-block",
            backgroundColor: "#E10600",
            color: "#ffffff",
            padding: "12px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open the task list
        </a>
      </div>
    </NotificationEmailLayout>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #E2E8F0",
  padding: "8px 8px",
  color: "#64748B",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #F1F5F9",
  padding: "10px 8px",
  verticalAlign: "middle",
};

export default TaskReminderDigestEmail;
