import {
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

export interface WeeklyGoalsFillReminderProps {
  recipientName: string;
  weekLabel: string;
  pendingCount: number;
  siteUrl: string;
}

export const previewText = () => `Update your % done before the week closes`;

/**
 * Saturday 18:00 IST — "fill in your % done". Sent to everyone who has goals
 * this week so they record progress before the week is scored.
 */
export function WeeklyGoalsFillReminderEmail(props: WeeklyGoalsFillReminderProps) {
  const goalsUrl = `${stripTrailingSlash(props.siteUrl)}/weekly-goals`;
  return (
    <NotificationEmailLayout preview={previewText()} siteUrl={props.siteUrl}>
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>Time to mark your % done for {props.weekLabel}.</NotificationHeadline>
      <NotificationParagraph>
        The week is wrapping up. Please update the <strong>% Done (Actual)</strong>{" "}
        on your{" "}
        {props.pendingCount > 0
          ? `${props.pendingCount} weekly ${props.pendingCount === 1 ? "goal" : "goals"}`
          : "weekly goals"}{" "}
        so your performance is scored accurately. Add a short explanation or a
        link to proof wherever it helps.
      </NotificationParagraph>
      <NotificationCTA href={goalsUrl}>Update my % done</NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default WeeklyGoalsFillReminderEmail;
