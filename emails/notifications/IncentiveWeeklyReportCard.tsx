import {
  Chip,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

/** One period row in the weekly report card. */
export interface IncentiveWeekPeriodRow {
  /** "Current Month", "Last Month", "Last 3 Months", "Last 6 Months", "YTD". */
  label: string;
  /** Rupees earned in that window. */
  earned: number;
}

export interface IncentiveWeeklyReportCardProps {
  recipientName: string;
  /** Friendly label for the week the card covers, e.g. "07 Sep – 13 Sep 2026". */
  weekLabel: string;
  /** YTD grade ("A" | "B" | "C" | "D"), or null when no CTC is on file. */
  grade: string | null;
  /** YTD % of CTC, two decimals, or null. */
  pctOfCtc: number | null;
  /** Exactly the five windows, canonical order. */
  periods: IncentiveWeekPeriodRow[];
  /** Current-month target, or null when none is set. */
  target: number | null;
  /** Current-month earned. */
  actual: number;
  /** earned − target; negative is a deficit. Null without a target. */
  difference: number | null;
  /** Competition rank over the current-month window, or null. */
  rank: number | null;
  /** Competition rank over the last-month window, or null. */
  previousRank: number | null;
  /** Already-formatted movement, e.g. "Up 2" / "Down 1" / "No change" / "New". */
  movementLabel: string;
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
function signed(n: number): string {
  return n >= 0 ? `+${rupees(n)}` : `-${rupees(-n)}`;
}

const GRADE_TONE: Record<string, "green" | "blue" | "amber" | "rose"> = {
  A: "green",
  B: "blue",
  C: "amber",
  D: "rose",
};

export const previewText = (p: Pick<IncentiveWeeklyReportCardProps, "grade" | "weekLabel">) =>
  `${p.grade ? `Grade ${p.grade}` : "Your"} incentive report card — ${p.weekLabel}`;

export function IncentiveWeeklyReportCardEmail(props: IncentiveWeeklyReportCardProps) {
  const incentiveUrl = `${stripTrailingSlash(props.siteUrl)}/incentive`;

  return (
    <NotificationEmailLayout
      preview={previewText({ grade: props.grade, weekLabel: props.weekLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>Your weekly incentive report card.</NotificationHeadline>
      <NotificationParagraph>
        Here is where your incentives stand for the week of {props.weekLabel}. Open
        the dashboard for the full breakdown.
      </NotificationParagraph>

      {/* Grade + % of CTC */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 20px" }}
      >
        <tbody>
          <tr>
            <td style={{ ...statCell, width: "50%" }}>
              <div style={statLabel}>YTD Grade</div>
              <div style={{ ...statValue, fontSize: 26 }}>
                {props.grade ? (
                  <span>
                    <Chip tone={GRADE_TONE[props.grade] ?? "ink"}>{props.grade}</Chip>
                  </span>
                ) : (
                  "—"
                )}
              </div>
            </td>
            <td style={{ ...statCell, width: "50%" }}>
              <div style={statLabel}>% of CTC (YTD)</div>
              <div style={statValue}>
                {props.pctOfCtc === null ? "—" : `${props.pctOfCtc}%`}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Five windows of earned */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 20px", fontSize: 13 }}
      >
        <thead>
          <tr>
            <th style={thStyle}>Period</th>
            <th style={{ ...thStyle, width: 110, textAlign: "right" }}>Earned</th>
          </tr>
        </thead>
        <tbody>
          {props.periods.map((p) => (
            <tr key={p.label}>
              <td style={{ ...tdStyle, color: "#0F172A", fontWeight: 600 }}>{p.label}</td>
              <td
                style={{
                  ...tdStyle,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {rupees(p.earned)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Target vs Actual (current month) */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 20px" }}
      >
        <tbody>
          <tr>
            <td style={statCell}>
              <div style={statLabel}>Target</div>
              <div style={statValue}>{props.target === null ? "—" : rupees(props.target)}</div>
            </td>
            <td style={statCell}>
              <div style={statLabel}>Actual</div>
              <div style={statValue}>{rupees(props.actual)}</div>
            </td>
            <td style={statCell}>
              <div style={statLabel}>Surplus / Deficit</div>
              <div style={{ ...statValue, color: deficitColor(props.difference) }}>
                {props.difference === null ? "—" : signed(props.difference)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Rank */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 8px" }}
      >
        <tbody>
          <tr>
            <td style={statCell}>
              <div style={statLabel}>Current Rank</div>
              <div style={statValue}>{props.rank === null ? "—" : `#${props.rank}`}</div>
            </td>
            <td style={statCell}>
              <div style={statLabel}>Previous Rank</div>
              <div style={statValue}>{props.previousRank === null ? "—" : `#${props.previousRank}`}</div>
            </td>
            <td style={statCell}>
              <div style={statLabel}>Movement</div>
              <div style={statValue}>{props.movementLabel}</div>
            </td>
          </tr>
        </tbody>
      </table>

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

function deficitColor(difference: number | null): string {
  if (difference === null) return "#0F172A";
  return difference >= 0 ? "#047857" : "#B91C1C";
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

export default IncentiveWeeklyReportCardEmail;
