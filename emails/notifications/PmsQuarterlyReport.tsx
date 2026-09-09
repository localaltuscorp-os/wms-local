import {
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
} from "./_notification-layout";

/** One pillar line in the PMS report. */
export interface PmsPillarLine {
  /** e.g. "KPI", "Skill Upgrade", "Compliance", "Attitude", "Team-Work". */
  label: string;
  /** 0..100 achieved for this pillar (already weighted-out), or null if no data. */
  pct: number | null;
  /** Weight this pillar carries in the overall 100. */
  weight: number;
}

export interface PmsQuarterlyReportProps {
  recipientName: string;
  /** Friendly quarter label, e.g. "Q1 FY 2026-27 (Apr–Jun)". */
  quarterLabel: string;
  /** Overall 0..100 score. */
  overallScore: number;
  /** Coarse band label for the overall score, e.g. "Strong". */
  bandLabel: string;
  pillars: PmsPillarLine[];
  siteUrl: string;
}

function pctText(pct: number | null): string {
  if (pct === null) return "—";
  return `${Math.round(pct)}%`;
}

export const previewText = (p: Pick<PmsQuarterlyReportProps, "quarterLabel" | "overallScore">) =>
  `Your ${p.quarterLabel} performance report — ${Math.round(p.overallScore)}/100`;

export function PmsQuarterlyReportEmail(props: PmsQuarterlyReportProps) {
  const pmsUrl = `${stripTrailingSlash(props.siteUrl)}/pms`;
  const score = Math.round(props.overallScore);

  return (
    <NotificationEmailLayout
      preview={previewText({ quarterLabel: props.quarterLabel, overallScore: props.overallScore })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>Your {props.quarterLabel} report.</NotificationHeadline>
      <NotificationParagraph>
        Here's your Performance Intelligence summary for the quarter. The full
        breakdown — including the self vs manager perception view — lives in the
        dashboard.
      </NotificationParagraph>

      {/* Overall score hero */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 20px" }}
      >
        <tbody>
          <tr>
            <td style={heroCell}>
              <div style={heroLabel}>Overall</div>
              <div style={heroValue}>
                {score}
                <span style={{ fontSize: 18, color: "#94A3B8", fontWeight: 600 }}>/100</span>
              </div>
              <div style={heroBand}>{props.bandLabel}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {props.pillars.length > 0 && (
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 16px", fontSize: 13 }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Pillar</th>
              <th style={{ ...thStyle, width: 70, textAlign: "right" }}>Weight</th>
              <th style={{ ...thStyle, width: 84, textAlign: "right" }}>Achieved</th>
            </tr>
          </thead>
          <tbody>
            {props.pillars.map((p, i) => (
              <tr key={`${p.label}-${i}`}>
                <td style={{ ...tdStyle, color: "#0F172A", fontWeight: 600 }}>{p.label}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#64748B" }}>{p.weight}</td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                  }}
                >
                  {pctText(p.pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ textAlign: "center", margin: "24px 0 4px" }}>
        <a href={pmsUrl} style={primaryBtn}>
          View my full report
        </a>
      </div>
    </NotificationEmailLayout>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#E10600",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};

const heroCell: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "18px 20px",
  textAlign: "center",
};
const heroLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#94A3B8",
  fontWeight: 600,
  marginBottom: 4,
};
const heroValue: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 800,
  color: "#0F172A",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};
const heroBand: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#E10600",
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

export default PmsQuarterlyReportEmail;
