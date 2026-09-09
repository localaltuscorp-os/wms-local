import {
  Chip,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

/** A recent ledger line shown in the monthly incentive digest. */
export interface IncentiveDigestEntry {
  /** "BSS Conversion — Productivity Shastra" style label. */
  label: string;
  /** First-of-month YYYY-MM-DD for the period this row belongs to. */
  periodMonth: string | null;
  /** Rupee amount approved for this row. */
  approved: number;
  /** True once the approved amount has been (fully) paid. */
  paid: boolean;
}

export interface IncentiveMonthlyDigestProps {
  recipientName: string;
  /** Friendly period label, e.g. "June 2026". */
  periodLabel: string;
  /** Approved rupees in the period. */
  approvedTotal: number;
  /** Paid rupees in the period. */
  paidTotal: number;
  /** Unpaid (approved − paid) rupees in the period. */
  unpaidTotal: number;
  /** Newest-first recent ledger lines (already capped by the caller). */
  recent: IncentiveDigestEntry[];
  siteUrl: string;
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
function rupees(n: number): string {
  return INR.format(Math.round(n));
}

const MONTH_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
function monthLabel(ymd: string | null): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return MONTH_FMT.format(d);
}

export const previewText = (p: Pick<IncentiveMonthlyDigestProps, "approvedTotal" | "periodLabel">) =>
  `${rupees(p.approvedTotal)} in incentives for ${p.periodLabel}`;

export function IncentiveMonthlyDigestEmail(props: IncentiveMonthlyDigestProps) {
  const incentiveUrl = `${stripTrailingSlash(props.siteUrl)}/incentive`;

  return (
    <NotificationEmailLayout
      preview={previewText({ approvedTotal: props.approvedTotal, periodLabel: props.periodLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>
        Your incentive summary for {props.periodLabel}.
      </NotificationHeadline>
      <NotificationParagraph>
        Here's how your incentives stacked up over the period. Open the dashboard
        for the full breakdown.
      </NotificationParagraph>

      {/* Totals row */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 20px" }}
      >
        <tbody>
          <tr>
            <td style={statCell}>
              <div style={statLabel}>Earned</div>
              <div style={statValue}>{rupees(props.approvedTotal)}</div>
            </td>
            <td style={statCell}>
              <div style={statLabel}>Paid</div>
              <div style={statValue}>{rupees(props.paidTotal)}</div>
            </td>
            <td style={statCell}>
              <div style={statLabel}>Unpaid</div>
              <div style={statValue}>{rupees(props.unpaidTotal)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {props.recent.length > 0 && (
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 16px", fontSize: 13 }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Incentive</th>
              <th style={{ ...thStyle, width: 70 }}>Period</th>
              <th style={{ ...thStyle, width: 92, textAlign: "right" }}>Amount</th>
              <th style={{ ...thStyle, width: 80, textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.recent.map((e, i) => (
              <tr key={`${e.label}-${i}`}>
                <td style={{ ...tdStyle, color: "#0F172A", fontWeight: 600 }}>{e.label}</td>
                <td style={{ ...tdStyle, color: "#64748B" }}>{monthLabel(e.periodMonth)}</td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rupees(e.approved)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <Chip tone={e.paid ? "green" : "amber"}>{e.paid ? "Paid" : "Pending"}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ textAlign: "center", margin: "24px 0 4px" }}>
        <a
          href={incentiveUrl}
          style={{
            display: "inline-block",
            backgroundColor: "#E10600",
            color: "#ffffff",
            padding: "12px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          View my incentives
        </a>
      </div>
    </NotificationEmailLayout>
  );
}

const statCell: React.CSSProperties = {
  width: "33.33%",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "12px 14px",
  verticalAlign: "top",
};
const statLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#94A3B8",
  fontWeight: 600,
  marginBottom: 4,
};
const statValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#0F172A",
  fontVariantNumeric: "tabular-nums",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #E2E8F0",
  padding: "8px 8px",
  color: "#64748B",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #F1F5F9",
  padding: "10px 8px",
  verticalAlign: "middle",
};

export default IncentiveMonthlyDigestEmail;
