import {
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  taskUrl,
} from "./_notification-layout";

export interface TaskInitiatedProps {
  recipientName: string;
  taskSubject: string;
  taskId: string;
  doerName?: string;
  dueAt?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<TaskInitiatedProps, "taskSubject">) =>
  `You're the initiator on "${p.taskSubject}"`;

export function TaskInitiatedEmail(props: TaskInitiatedProps) {
  const items: Array<{ label: string; value: React.ReactNode }> = [];
  if (props.doerName) items.push({ label: "Assigned to", value: props.doerName });
  if (props.dueAt) items.push({ label: "Due", value: props.dueAt });

  return (
    <NotificationEmailLayout
      preview={previewText({ taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <NotificationHeadline>
        You're the initiator on "{props.taskSubject}".
      </NotificationHeadline>
      <NotificationParagraph>
        You'll be asked to approve or send back the work once it's marked Done.
        We'll notify you at every step.
      </NotificationParagraph>
      {items.length > 0 && <MetaList items={items} />}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open task
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default TaskInitiatedEmail;
