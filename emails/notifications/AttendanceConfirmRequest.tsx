import {
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  Chip,
  stripTrailingSlash,
} from "./_notification-layout";

/** One person awaiting attendance confirmation. */
export interface AttendanceConfirmRow {
  /** Person whose outside-office attendance is being confirmed. */
  name: string;
  /** Short status/summary, e.g. "5 days present · 1 late". */
  summary: string;
  /** True → already looks in order; false → needs a look. */
  ok?: boolean;
}

export interface AttendanceConfirmRequestProps {
  recipientName: string;
  /** "your team" (manager) or "the managers" (accountant) — who they confirm. */
  scopeLabel: string;
  /** Friendly week label, e.g. "week of Mon, 7 Jul 2026". */
  weekLabel: string;
  rows: AttendanceConfirmRow[];
  /** One-click approve link (single-use token URL). */
  approveUrl: string;
  siteUrl: string;
}

export const previewText = (p: Pick<AttendanceConfirmRequestProps, "scopeLabel" | "weekLabel">) =>
  `Confirm ${p.scopeLabel}'s attendance for the ${p.weekLabel}`;

export function AttendanceConfirmRequestEmail(props: AttendanceConfirmRequestProps) {
  const reviewUrl = `${stripTrailingSlash(props.siteUrl)}/attendance/confirmations`;

  return (
    <NotificationEmailLayout
      preview={previewText({ scopeLabel: props.scopeLabel, weekLabel: props.weekLabel })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>Hi {props.recipientName},</NotificationParagraph>
      <NotificationHeadline>
        Please confirm {props.scopeLabel}'s attendance.
      </NotificationHeadline>
      <NotificationParagraph>
        It's Monday — time to confirm the outside-office attendance for{" "}
        <strong>{props.weekLabel}</strong>. Tap the button below to confirm in one
        click, or open the dashboard to review each person first.
      </NotificationParagraph>

      {props.rows.length > 0 && (
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0 20px", fontSize: 13 }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Person</th>
              <th style={thStyle}>This week</th>
              <th style={{ ...thStyle, width: 84, textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <td style={{ ...tdStyle, color: "#0F172A", fontWeight: 600 }}>{r.name}</td>
                <td style={{ ...tdStyle, color: "#64748B" }}>{r.summary}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <Chip tone={r.ok === false ? "amber" : "green"}>
                    {r.ok === false ? "Review" : "Looks OK"}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ textAlign: "center", margin: "24px 0 4px" }}>
        <a href={props.approveUrl} style={primaryBtn}>
          Confirm attendance
        </a>
      </div>
      <div style={{ textAlign: "center", margin: "0 0 4px" }}>
        <a href={reviewUrl} style={{ fontSize: 13, color: "#64748B", textDecoration: "underline" }}>
          Review each person in the dashboard
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

export default AttendanceConfirmRequestEmail;
