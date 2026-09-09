import {
  Chip,
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

export interface AttendanceLateWaivedProps {
  recipientName: string;
  dateLabel: string;
  inAt: string | null;
  outAt: string | null;
  hoursLabel: string;
  siteUrl: string;
}

export const previewText = (p: Pick<AttendanceLateWaivedProps, "dateLabel">) =>
  `Full day logged — late arrival waived on ${p.dateLabel}`;

export function AttendanceLateWaivedEmail(props: AttendanceLateWaivedProps) {
  return (
    <NotificationEmailLayout
      preview={previewText({ dateLabel: props.dateLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="amber">Late · waived</Chip>
      </div>
      <NotificationHeadline>Full day logged — late arrival waived.</NotificationHeadline>
      <NotificationParagraph>
        You arrived late (or left early), but you put in a full day&apos;s work, so the
        day counts as a full present day. Nice recovery.
      </NotificationParagraph>
      <MetaList
        items={[
          { label: "Date", value: props.dateLabel },
          { label: "Checked in", value: props.inAt ?? "—" },
          { label: "Checked out", value: props.outAt ?? "—" },
          { label: "Worked", value: props.hoursLabel },
        ]}
      />
      <NotificationCTA href={`${stripTrailingSlash(props.siteUrl)}/attendance`}>
        View my attendance
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default AttendanceLateWaivedEmail;
