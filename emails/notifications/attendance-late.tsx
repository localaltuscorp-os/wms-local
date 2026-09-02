import {
  Chip,
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

export interface AttendanceLateProps {
  recipientName: string;
  /** YYYY-MM-DD (already formatted for display by the caller is fine too). */
  dateLabel: string;
  inAt: string | null;
  lateAfter?: string | null;
  siteUrl: string;
}

export const previewText = (p: Pick<AttendanceLateProps, "dateLabel">) =>
  `Late check-in on ${p.dateLabel}`;

export function AttendanceLateEmail(props: AttendanceLateProps) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Date", value: props.dateLabel },
    { label: "Checked in", value: props.inAt ?? "—" },
  ];
  if (props.lateAfter) {
    items.push({ label: "On-time by", value: props.lateAfter });
  }
  return (
    <NotificationEmailLayout
      preview={previewText({ dateLabel: props.dateLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="red">Late check-in</Chip>
      </div>
      <NotificationHeadline>You checked in late today.</NotificationHeadline>
      <NotificationParagraph>
        Your check-in was recorded after the on-time cut-off. A full day&apos;s work
        can still waive this — make sure you complete your hours.
      </NotificationParagraph>
      <MetaList items={items} />
      <NotificationCTA href={`${stripTrailingSlash(props.siteUrl)}/attendance`}>
        View my attendance
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default AttendanceLateEmail;
