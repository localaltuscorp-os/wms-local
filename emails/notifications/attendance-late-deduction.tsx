import {
  Chip,
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

export interface AttendanceLateDeductionProps {
  recipientName: string;
  /** Friendly month label this deduction applies to, e.g. "June 2026". */
  monthLabel: string;
  /** The employee's un-waived late count for the month (a multiple of 3). */
  lateCount: number;
  /** YYYY-MM-DD (already display-formatted by the caller is fine too). */
  dateLabel: string;
  siteUrl: string;
}

export const previewText = (p: Pick<AttendanceLateDeductionProps, "monthLabel">) =>
  `A half-day deduction applies for ${p.monthLabel}`;

export function AttendanceLateDeductionEmail(props: AttendanceLateDeductionProps) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Month", value: props.monthLabel },
    { label: "Late arrivals", value: String(props.lateCount) },
    { label: "This late", value: props.dateLabel },
  ];
  return (
    <NotificationEmailLayout
      preview={previewText({ monthLabel: props.monthLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone="red">Half-day deduction</Chip>
      </div>
      <NotificationHeadline>
        Your {props.lateCount}th late this month triggers a ½-day deduction.
      </NotificationHeadline>
      <NotificationParagraph>
        Every third late check-in in a pay period results in a half-day&apos;s
        salary deduction. With {props.lateCount} late arrivals in{" "}
        {props.monthLabel}, a half-day will be deducted for this period. Please
        check in on time to avoid further deductions.
      </NotificationParagraph>
      <MetaList items={items} />
      <NotificationCTA href={`${stripTrailingSlash(props.siteUrl)}/attendance`}>
        View my attendance
      </NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default AttendanceLateDeductionEmail;
