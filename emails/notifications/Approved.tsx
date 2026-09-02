import {
  Chip,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  taskUrl,
} from "./_notification-layout";

export interface ApprovedProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  note?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<ApprovedProps, "actorName" | "taskSubject">) =>
  `${p.actorName} approved "${p.taskSubject}"`;

export function ApprovedEmail(props: ApprovedProps) {
  return (
    <NotificationEmailLayout
      preview={previewText({ actorName: props.actorName, taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="green">Approved</Chip>
      </div>
      <NotificationHeadline>
        {props.actorName} approved your work.
      </NotificationHeadline>
      <NotificationParagraph>
        <strong>{props.taskSubject}</strong> is now closed out. Nice work.
      </NotificationParagraph>
      {props.note && <Quote>{props.note}</Quote>}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open task
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default ApprovedEmail;
