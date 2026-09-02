import {
  Chip,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  taskUrl,
} from "./_notification-layout";

export interface ReassignedProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  /**
   * `true` if the recipient is the *new* doer (incoming).
   * `false` if the recipient was moved *off* the task (outgoing).
   */
  isIncoming: boolean;
  /** The other employee involved in the reassignment. */
  counterpartName?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<ReassignedProps, "taskSubject" | "isIncoming">) =>
  p.isIncoming
    ? `You've been assigned "${p.taskSubject}"`
    : `"${p.taskSubject}" was moved off your queue`;

export function ReassignedEmail(props: ReassignedProps) {
  const headline = props.isIncoming
    ? `You've been assigned "${props.taskSubject}".`
    : `"${props.taskSubject}" was reassigned.`;

  const body = props.isIncoming
    ? props.counterpartName
      ? `${props.actorName} moved this task from ${props.counterpartName} to you.`
      : `${props.actorName} assigned this task to you.`
    : props.counterpartName
      ? `${props.actorName} reassigned this task to ${props.counterpartName}. No further action needed from you.`
      : `${props.actorName} reassigned this task to someone else. No further action needed from you.`;

  return (
    <NotificationEmailLayout
      preview={previewText({ taskSubject: props.taskSubject, isIncoming: props.isIncoming })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="purple">{props.isIncoming ? "Assigned to you" : "Reassigned"}</Chip>
      </div>
      <NotificationHeadline>{headline}</NotificationHeadline>
      <NotificationParagraph>{body}</NotificationParagraph>
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open task
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default ReassignedEmail;
