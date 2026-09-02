import {
  Chip,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  taskUrl,
} from "./_notification-layout";

export interface TransferredProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  externalTo?: string;
  note?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<TransferredProps, "taskSubject">) =>
  `"${p.taskSubject}" was transferred externally`;

export function TransferredEmail(props: TransferredProps) {
  return (
    <NotificationEmailLayout
      preview={previewText({ taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="purple">Transferred externally</Chip>
      </div>
      <NotificationHeadline>
        "{props.taskSubject}" was transferred.
      </NotificationHeadline>
      <NotificationParagraph>
        {props.actorName} transferred this task
        {props.externalTo ? <> to <strong>{props.externalTo}</strong></> : null}
        . It's no longer tracked inside Altus Corp Dashboard.
      </NotificationParagraph>
      {props.note && <Quote>{props.note}</Quote>}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        View final record
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default TransferredEmail;
