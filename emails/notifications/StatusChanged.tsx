import {
  Chip,
  type ChipTone,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  STATUS_LABEL_MAP,
  STATUS_TONE_MAP,
  taskUrl,
} from "./_notification-layout";

export interface StatusChangedProps {
  recipientName: string;
  actorName: string;
  taskSubject: string;
  taskId: string;
  toStatus: string;
  fromStatus?: string;
  siteUrl: string;
  // M5.1 — admin-configured display overrides resolved at the dispatch
  // site. When provided, win over the static STATUS_*_MAP in
  // _notification-layout.tsx (which is now the fallback path).
  toLabelOverride?: string;
  toToneOverride?: ChipTone;
  fromLabelOverride?: string;
  fromToneOverride?: ChipTone;
}

export const previewText = (
  p: Pick<StatusChangedProps, "taskSubject" | "toStatus" | "toLabelOverride">,
) =>
  `Status on "${p.taskSubject}" → ${p.toLabelOverride ?? STATUS_LABEL_MAP[p.toStatus] ?? p.toStatus}`;

export function StatusChangedEmail(props: StatusChangedProps) {
  const toLabel =
    props.toLabelOverride ?? STATUS_LABEL_MAP[props.toStatus] ?? props.toStatus;
  const toTone: ChipTone =
    props.toToneOverride ?? STATUS_TONE_MAP[props.toStatus] ?? "ink";
  const fromLabel = props.fromStatus
    ? props.fromLabelOverride ??
      STATUS_LABEL_MAP[props.fromStatus] ??
      props.fromStatus
    : null;
  const fromTone: ChipTone | null = props.fromStatus
    ? props.fromToneOverride ?? STATUS_TONE_MAP[props.fromStatus] ?? "ink"
    : null;

  return (
    <NotificationEmailLayout
      preview={previewText({ taskSubject: props.taskSubject, toStatus: props.toStatus })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <NotificationHeadline>
        Status changed on "{props.taskSubject}".
      </NotificationHeadline>
      <NotificationParagraph>
        <strong>{props.actorName}</strong> moved this task to:
      </NotificationParagraph>
      <div style={{ margin: "0 0 20px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {fromLabel && fromTone && (
          <>
            <Chip tone={fromTone}>{fromLabel}</Chip>
            <span style={{ color: "#94A3B8", fontSize: 14 }}>→</span>
          </>
        )}
        <Chip tone={toTone}>{toLabel}</Chip>
      </div>
      <NotificationCTA href={taskUrl(props.siteUrl, props.taskId)}>
        Open task
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default StatusChangedEmail;
