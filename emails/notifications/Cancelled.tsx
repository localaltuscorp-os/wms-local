import {
  Chip,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  taskUrl,
} from "./_notification-layout";

export interface CancelledProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  note?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<CancelledProps, "taskSubject">) =>
  `"${p.taskSubject}" was cancelled`;

export function CancelledEmail(props: CancelledProps) {
  return (
    <NotificationEmailLayout
      preview={previewText({ taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="rose">Cancelled</Chip>
      </div>
      <NotificationHeadline>
        "{props.taskSubject}" was cancelled.
      </NotificationHeadline>
      <NotificationParagraph>
        {props.actorName} cancelled this task. No further action needed.
      </NotificationParagraph>
      {props.note && <Quote>{props.note}</Quote>}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        View final record
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default CancelledEmail;
