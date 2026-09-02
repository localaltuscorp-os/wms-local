import {
  Chip,
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

export interface AttendanceHalfDayProps {
  recipientName: string;
  dateLabel: string;
  inAt: string | null;
  outAt: string | null;
  hoursLabel: string;
  siteUrl: string;
}

export const previewText = (p: Pick<AttendanceHalfDayProps, "dateLabel">) =>
  `Half-day recorded on ${p.dateLabel}`;

export function AttendanceHalfDayEmail(props: AttendanceHalfDayProps) {
  return (
    <NotificationEmailLayout
      preview={previewText({ dateLabel: props.dateLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="amber">Half-day</Chip>
      </div>
      <NotificationHeadline>A half-day was recorded.</NotificationHeadline>
      <NotificationParagraph>
        Your worked hours for the day were below the half-day threshold, so this day
        counts as a half-day. If this looks wrong, ask an admin to review your punches.
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

export default AttendanceHalfDayEmail;
