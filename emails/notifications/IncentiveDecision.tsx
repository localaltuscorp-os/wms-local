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
 * Event email — sent when an admin APPROVES or REJECTS an incentive
 * REQUEST (see `decideIncentiveRequest` in app/(app)/incentive/actions.ts).
 *
 * Incentive requests carry no monetary amount of their own (the amount is
 * assigned later in the permanent ledger), so we summarise the request by
 * its TYPE plus the first couple of stored detail fields, then surface the
 * verdict + any admin note.
 */
export interface IncentiveDecisionProps {
  recipientName: string;
  /** "BSS Conversion", "Sales Pitch", … */
  typeLabel: string;
  verdict: "approved" | "rejected";
  /** A few label/value pairs from the request's details (already trimmed). */
  detailPairs: Array<[string, string]>;
  /** Admin's optional decision note. */
  note?: string | null;
  siteUrl: string;
}

export const previewText = (p: Pick<IncentiveDecisionProps, "typeLabel" | "verdict">) =>
  `Your ${p.typeLabel} incentive request was ${p.verdict}`;

export function IncentiveDecisionEmail(props: IncentiveDecisionProps) {
  const approved = props.verdict === "approved";
  const incentiveUrl = `${stripTrailingSlash(props.siteUrl)}/incentive`;

  return (
    <NotificationEmailLayout
      preview={previewText({ typeLabel: props.typeLabel, verdict: props.verdict })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <div style={{ margin: "0 0 12px" }}>
        <Chip tone={approved ? "green" : "red"}>
          {approved ? "Approved" : "Rejected"}
        </Chip>
      </div>
      <NotificationHeadline>
        Your {props.typeLabel} incentive request was {approved ? "approved" : "rejected"}.
      </NotificationHeadline>
      <NotificationParagraph>
        {approved
          ? "Nice work — this request has been approved. It will be reflected in your incentive ledger once the amount is finalised."
          : "This request was not approved. See the note below for details, and reach out to your manager if you have questions."}
      </NotificationParagraph>

      {props.detailPairs.length > 0 && (
        <MetaList
          items={[
            { label: "Type", value: props.typeLabel },
            ...props.detailPairs.map(([label, value]) => ({ label, value })),
          ]}
        />
      )}

      {props.note && <Quote>{props.note}</Quote>}

      <NotificationCTA href={incentiveUrl}>View my incentives</NotificationCTA>
    </NotificationEmailLayout>
  );
}

export default IncentiveDecisionEmail;
