import {
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  taskUrl,
} from "./_notification-layout";

const COMMENT_CLIP = 280;

export interface CommentedProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  comment?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<CommentedProps, "actorName" | "taskSubject">) =>
  `${p.actorName} commented on "${p.taskSubject}"`;

export function CommentedEmail(props: CommentedProps) {
  const raw = (props.comment ?? "").trim();
  const clipped =
    raw.length > COMMENT_CLIP ? `${raw.slice(0, COMMENT_CLIP)}…` : raw;

  return (
    <NotificationEmailLayout
      preview={previewText({ actorName: props.actorName, taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <NotificationHeadline>
        {props.actorName} commented on "{props.taskSubject}".
      </NotificationHeadline>
      {clipped ? (
        <Quote>{clipped}</Quote>
      ) : (
        <NotificationParagraph muted>(Empty comment.)</NotificationParagraph>
      )}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open thread
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default CommentedEmail;
