import type { IncentiveEmailContent } from "@/lib/incentive/notifications/content";
import {
  Chip,
  MetaList,
  NotificationCTA,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Quote,
  stripTrailingSlash,
} from "./_notification-layout";

/**
 * The ONE layout every incentive email uses — New Incentive, Eligibility
 * Removed, Updated, Deleted, Not Approved, Approved, Due, Paid, Resubmitted,
 * Reversed, Revision Required, Published.
 *
 * What each of those says is data (`INCENTIVE_EMAIL_TEMPLATES` in
 * lib/incentive/notifications/content.ts); this renders it in the same
 * notification shell as every other WMS email. React escapes every value, so a
 * rejection reason or justification is shown exactly as typed and never as HTML.
 */
export interface IncentiveNoticeProps extends IncentiveEmailContent {
  recipientName: string;
  siteUrl: string;
}

const LABEL_STYLE = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "#64748B",
  margin: "0 0 6px",
};

export function IncentiveNoticeEmail(props: IncentiveNoticeProps) {
  const href = `${stripTrailingSlash(props.siteUrl)}${props.cta.path}`;
  return (
    <NotificationEmailLayout preview={props.preview} siteUrl={props.siteUrl}>
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone={props.chip.tone}>{props.chip.label}</Chip>
      </div>
      <NotificationHeadline>{props.headline}</NotificationHeadline>
      <NotificationParagraph>{props.lead}</NotificationParagraph>

      {props.quote && (
        <div>
          <div style={LABEL_STYLE}>{props.quote.label}</div>
          <Quote>
            <span style={{ whiteSpace: "pre-wrap" }}>{props.quote.text}</span>
          </Quote>
        </div>
      )}

      {props.details.length > 0 && <MetaList items={props.details} />}

      {props.changes && props.changes.length > 0 && (
        <div style={{ margin: "0 0 20px" }}>
          <div style={LABEL_STYLE}>What changed</div>
          {props.changes.map((c) => (
            <div key={c.label} style={{ fontSize: 13, lineHeight: 1.55, color: "#334155", padding: "3px 0" }}>
              <strong>{c.label}:</strong>{" "}
              <span style={{ color: "#94A3B8", textDecoration: "line-through" }}>{c.from}</span> → {c.to}
            </div>
          ))}
        </div>
      )}

      <NotificationCTA href={href}>{props.cta.label}</NotificationCTA>
      {props.footnote && <NotificationParagraph muted>{props.footnote}</NotificationParagraph>}
    </NotificationEmailLayout>
  );
}

export default IncentiveNoticeEmail;
