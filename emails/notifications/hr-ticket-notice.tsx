import {
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

/**
 * HR Support ticket email — one reusable template for every ticket
 * notification kind (created / assigned / replied / status changed). The
 * dispatcher's notification TITLE already carries the human summary; this body
 * frames it and deep-links to the thread.
 *
 * CONFIDENTIALITY: for a grievance the caller passes `confidential` so the copy
 * stays generic — the subject line is never rendered here (it isn't even passed
 * in). The title the dispatcher built is likewise generic for confidential
 * tickets.
 */
export interface HrTicketNoticeProps {
  recipientName: string;
  /** Big headline — the notification title. */
  heading: string;
  /** Short supporting sentence. */
  lead: string;
  ticketNo: number;
  confidential: boolean;
  ctaHref: string;
  ctaLabel: string;
}

export const previewText = (p: Pick<HrTicketNoticeProps, "heading">) => p.heading;

export function HrTicketNoticeEmail(props: HrTicketNoticeProps) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Reference", value: `#${props.ticketNo}` },
  ];
  if (props.confidential) items.push({ label: "Visibility", value: "Confidential" });
  return (
    <NotificationEmailLayout preview={previewText(props)} siteUrl="">
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>{props.heading}</NotificationHeadline>
      <NotificationParagraph>{props.lead}</NotificationParagraph>
      <MetaList items={items} />
      <NotificationCTA href={props.ctaHref}>{props.ctaLabel}</NotificationCTA>
    </NotificationEmailLayout>
  );
}

/** Build the absolute thread URL from the site base + ticket id. */
export function ticketThreadUrl(siteUrl: string, ticketId: string): string {
  return `${stripTrailingSlash(siteUrl)}/support/${ticketId}`;
}

export default HrTicketNoticeEmail;
