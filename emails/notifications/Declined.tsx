import {
  Chip,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  taskUrl,
} from "./_notification-layout";

export interface DeclinedProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  note?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<DeclinedProps, "actorName" | "taskSubject">) =>
  `${p.actorName} sent "${p.taskSubject}" back`;

export function DeclinedEmail(props: DeclinedProps) {
  return (
    <NotificationEmailLayout
      preview={previewText({ actorName: props.actorName, taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="red">Sent back</Chip>
      </div>
      <NotificationHeadline>
        {props.actorName} sent "{props.taskSubject}" back.
      </NotificationHeadline>
      <NotificationParagraph>
        The task is back in your court. Here's their note:
      </NotificationParagraph>
      {props.note ? (
        <Quote>{props.note}</Quote>
      ) : (
        <NotificationParagraph muted>
          (No note provided.)
        </NotificationParagraph>
      )}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open task
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default DeclinedEmail;
