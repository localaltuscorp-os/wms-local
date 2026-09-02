import {
  Chip,
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  PRIORITY_LABEL_MAP,
  taskUrl,
} from "./_notification-layout";

export interface TaskAssignedProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  priority?: string;
  dueAt?: string;
  initiatorName?: string;
  siteUrl: string;
}

export const previewText = (p: Pick<TaskAssignedProps, "actorName" | "taskSubject">) =>
  `${p.actorName} assigned you "${p.taskSubject}"`;

export function TaskAssignedEmail(props: TaskAssignedProps) {
  const items: Array<{ label: string; value: React.ReactNode }> = [];
  if (props.priority) {
    items.push({
      label: "Priority",
      value: <Chip tone={priorityTone(props.priority)}>{PRIORITY_LABEL_MAP[props.priority] ?? props.priority}</Chip>,
    });
  }
  if (props.dueAt) items.push({ label: "Due", value: props.dueAt });
  if (props.initiatorName) items.push({ label: "Initiator", value: props.initiatorName });

  return (
    <NotificationEmailLayout
      preview={previewText({ actorName: props.actorName, taskSubject: props.taskSubject })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <NotificationHeadline>
        {props.actorName} assigned you a task.
      </NotificationHeadline>
      <NotificationParagraph>
        <strong>{props.taskSubject}</strong>
      </NotificationParagraph>
      {items.length > 0 && <MetaList items={items} />}
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open task
      </NotificationCTA>
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

export default TaskAssignedEmail;
