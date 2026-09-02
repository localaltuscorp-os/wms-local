import {
  Chip,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
  taskUrl,
} from "./_notification-layout";
import type { PendingDigestTask } from "./types";

export interface DailyDigestProps {
  recipientName: string;
  pendingTasks: PendingDigestTask[];
  siteUrl: string;
}

export const previewText = (p: Pick<DailyDigestProps, "pendingTasks">) => {
  const n = p.pendingTasks.length;
  if (n === 0) return "You're all caught up — no pending tasks";
  if (n === 1) return "You have 1 pending task";
  return `You have ${n} pending tasks`;
};

const DATE_FMT = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" });
function formatDue(d: Date | null): string {
  return d ? DATE_FMT.format(d) : "—";
}

export function DailyDigestEmail(props: DailyDigestProps) {
  const n = props.pendingTasks.length;

  if (n === 0) {
    return (
      <NotificationEmailLayout
        preview={previewText({ pendingTasks: props.pendingTasks })}
        siteUrl={props.siteUrl}
      >
        <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
        <NotificationHeadline>You're all caught up. 🎉</NotificationHeadline>
        <NotificationParagraph>
          You have no pending tasks this morning. Have a great day.
        </NotificationParagraph>
      </NotificationEmailLayout>
    );
  }

  const headline = n === 1 ? "You have 1 pending task." : `You have ${n} pending tasks.`;

  return (
    <NotificationEmailLayout
      preview={previewText({ pendingTasks: props.pendingTasks })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>{headline}</NotificationHeadline>
      <NotificationParagraph>
        Here's your work for today. Overdue items are flagged at the top — tap any
        row to open the task.
      </NotificationParagraph>

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 16px", fontSize: 13 }}
      >
        <thead>
          <tr>
            <th style={thStyle}>Task</th>
            <th style={{ ...thStyle, width: 110 }}>Status</th>
            <th style={{ ...thStyle, width: 76, textAlign: "right" }}>Due</th>
          </tr>
        </thead>
        <tbody>
          {props.pendingTasks.map((t) => (
            <tr key={t.id}>
              <td style={tdStyle}>
                <a
                  href={taskUrl(props.siteUrl, t.id)}
                  style={{ color: "#0F172A", fontWeight: 600, textDecoration: "none", lineHeight: 1.4 }}
                >
                  {t.subject}
                </a>
              </td>
              <td style={tdStyle}>
                {t.isOverdue ? (
                  <Chip tone={t.daysOverdue >= 7 ? "red" : "amber"}>{t.daysOverdue}d overdue</Chip>
                ) : (
                  <Chip tone="blue">Pending</Chip>
                )}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#64748B", fontVariantNumeric: "tabular-nums" }}>
                {formatDue(t.dueAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ textAlign: "center", margin: "24px 0 4px" }}>
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
          Open my tasks
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

export default DailyDigestEmail;
