import {
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  stripTrailingSlash,
} from "./_notification-layout";

export interface WeeklyGoalsIncompleteProps {
  recipientName: string;
  weekLabel: string;
  unmarkedCount: number;
  siteUrl: string;
}

export const previewText = (p: Pick<WeeklyGoalsIncompleteProps, "unmarkedCount">) =>
  `${p.unmarkedCount} weekly ${p.unmarkedCount === 1 ? "goal" : "goals"} still unmarked`;

/**
 * Sunday + Monday 09:45 IST — escalation nudge. Sent only to people who still
 * have goals sitting at 0% / unmarked, so it's quiet for those already done.
 */
export function WeeklyGoalsIncompleteEmail(props: WeeklyGoalsIncompleteProps) {
  const goalsUrl = `${stripTrailingSlash(props.siteUrl)}/weekly-goals`;
  return (
    <NotificationEmailLayout
      preview={previewText({ unmarkedCount: props.unmarkedCount })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>You haven&apos;t marked your goals yet.</NotificationHeadline>
      <NotificationParagraph>
        For {props.weekLabel}, you still have{" "}
        <strong>
          {props.unmarkedCount} {props.unmarkedCount === 1 ? "goal" : "goals"}
        </strong>{" "}
        without a recorded % done.
      </NotificationParagraph>
      <Quote>
        Marking your progress takes under a minute and keeps your performance
        ranking fair. Anything not finished can be carried over to next week.
      </Quote>
      <NotificationCTA href={goalsUrl}>Mark my progress now</NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default WeeklyGoalsIncompleteEmail;
