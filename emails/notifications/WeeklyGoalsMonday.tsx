import {
  Chip,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  PRIORITY_LABEL_MAP,
  stripTrailingSlash,
} from "./_notification-layout";

export interface WeeklyGoalLine {
  client: string | null;
  subject: string | null;
  priority: string;
  targetDone: string | null;
}

export interface WeeklyGoalsMondayProps {
  recipientName: string;
  weekLabel: string;
  goals: WeeklyGoalLine[];
  siteUrl: string;
}

export const previewText = (p: Pick<WeeklyGoalsMondayProps, "goals">) =>
  p.goals.length > 0
    ? `Your ${p.goals.length} priorities for the week`
    : `Set your priorities for the week`;

/**
 * Monday 10:00 IST — "here are your priorities for the week". When the
 * employee hasn't been assigned anything yet, it nudges them to add some.
 */
export function WeeklyGoalsMondayEmail(props: WeeklyGoalsMondayProps) {
  const goalsUrl = `${stripTrailingSlash(props.siteUrl)}/weekly-goals`;
  return (
    <NotificationEmailLayout
      preview={previewText({ goals: props.goals })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Good morning {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>Your priorities for {props.weekLabel}.</NotificationHeadline>

      {props.goals.length === 0 ? (
        <NotificationParagraph>
          You don&apos;t have any weekly goals set yet. Take two minutes to add the
          top things you want to finish this week — it keeps everyone aligned.
        </NotificationParagraph>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0 8px" }}>
          <tbody>
            {props.goals.map((g, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #EEF2F6" }}>
                <td style={{ padding: "8px 8px 8px 0", fontSize: 13, color: "#64748B", width: 24, verticalAlign: "top" }}>
                  {i + 1}.
                </td>
                <td style={{ padding: "8px 0", fontSize: 14, color: "#0F172A" }}>
                  <strong>{g.client || g.subject || "Priority"}</strong>
                  {g.client && g.subject ? (
                    <span style={{ color: "#64748B" }}> · {g.subject}</span>
                  ) : null}
                  {g.targetDone ? (
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{g.targetDone}</div>
                  ) : null}
                </td>
                <td style={{ padding: "8px 0", textAlign: "right", verticalAlign: "top" }}>
                  <Chip tone={priorityTone(g.priority)}>
                    {PRIORITY_LABEL_MAP[g.priority] ?? g.priority}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <NotificationCTA href={goalsUrl}>Open Weekly Goals</NotificationCTA>
    </NotificationEmailLayout>
  );
}

function priorityTone(p: string): "red" | "amber" | "blue" | "ink" {
  switch (p) {
    case "imp_urgent": return "red";
    case "imp_not_urgent": return "amber";
    case "not_imp_urgent": return "blue";
    default: return "ink";
  }
}

export default WeeklyGoalsMondayEmail;
