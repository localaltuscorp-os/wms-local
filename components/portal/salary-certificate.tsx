/**
 * <SalaryCertificate> — a read-only, print-ready Salary Certificate rendered on
 * the firm's branded letterhead.
 *
 * PURE presentational component (no "use client", no server-only imports) so it
 * renders equally well inside the client PortalScreen tree AND on the server.
 * It reuses the shared <Letterhead> frame (per-entity branding, A4, print/PDF
 * friendly) exactly the way HR letters render for print. Load-neutral.
 *
 * The data comes from `getMySalaryCertificate()` (scoped to the signed-in
 * employee); this component only formats it — it never fetches.
 */

import { Letterhead } from "@/components/hr/letterhead/letterhead";
import type { PortalSalaryCertificate } from "@/app/(app)/portal/portal-types";
import { formatDate } from "@/lib/format";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** "12 Sep 2026" — the human date the certificate is issued on. */
function longDate(d: Date): string {
  return formatDate(d);
}

export interface SalaryCertificateProps {
  cert: PortalSalaryCertificate;
  /** Issue date; defaults to today. Passed explicitly for deterministic print. */
  issuedOn?: Date;
}

export function SalaryCertificate({ cert, issuedOn }: SalaryCertificateProps) {
  const issued = issuedOn ?? new Date();
  const firm = cert.entity.legalName;
  const designation = cert.designation?.trim() || "an employee";
  const single = cert.monthsCount <= 1;

  const details: [string, string][] = [
    ["Employee Name", cert.employeeName],
    ["Designation", cert.designation?.trim() || "—"],
    ["Employer", firm],
    ["Annual CTC", inr(cert.annualCtc)],
    ["Monthly CTC", inr(cert.monthlyCtc)],
    [
      single ? "Salary Month" : "Records on File",
      single
        ? cert.latestMonthLabel
        : `${cert.firstMonthLabel} – ${cert.latestMonthLabel} (${cert.monthsCount} months)`,
    ],
  ];

  return (
    <Letterhead entity={cert.companyName ?? cert.entity.id}>
      <div style={{ fontFamily: "var(--font-display, Georgia, 'Times New Roman', serif)" }}>
        {/* Ref / date line */}
        <p style={{ textAlign: "right", margin: "0 0 18px", fontSize: 13.5, color: "#3f3f46" }}>
          Date: {longDate(issued)}
        </p>

        {/* Title */}
        <h1
          style={{
            textAlign: "center",
            margin: "0 0 22px",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            textDecoration: "underline",
            textUnderlineOffset: 6,
          }}
        >
          Salary Certificate
        </h1>

        {/* Body */}
        <p style={{ margin: "0 0 14px" }}>To whomsoever it may concern,</p>

        <p style={{ margin: "0 0 14px", textAlign: "justify" }}>
          This is to certify that <strong>{cert.employeeName}</strong> is employed with{" "}
          <strong>{firm}</strong> as <strong>{designation}</strong>, drawing an annual CTC of{" "}
          <strong>{inr(cert.annualCtc)}</strong> (
          <strong>{inr(cert.monthlyCtc)}</strong> per month).
        </p>

        <p style={{ margin: "0 0 18px", textAlign: "justify" }}>
          {single ? (
            <>
              Salary records are available for <strong>{cert.latestMonthLabel}</strong>.
            </>
          ) : (
            <>
              The employee has salary records with us from{" "}
              <strong>{cert.firstMonthLabel}</strong> through{" "}
              <strong>{cert.latestMonthLabel}</strong>.
            </>
          )}{" "}
          This certificate is issued on the employee&apos;s request for their records.
        </p>

        {/* Details table */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            margin: "0 0 26px",
            fontSize: 14,
          }}
        >
          <tbody>
            {details.map(([k, v]) => (
              <tr key={k}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "7px 12px",
                    width: "42%",
                    border: "1px solid #e4e4e7",
                    background: "#faf7f7",
                    fontWeight: 700,
                    color: "#3f3f46",
                  }}
                >
                  {k}
                </th>
                <td style={{ padding: "7px 12px", border: "1px solid #e4e4e7", fontWeight: 600 }}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signature block */}
        <div style={{ marginTop: 44 }}>
          <p style={{ margin: "0 0 2px", fontWeight: 700 }}>For {firm}</p>
          <div style={{ height: 40 }} />
          <p style={{ margin: 0, borderTop: "1px solid #111114", display: "inline-block", paddingTop: 4, fontWeight: 700 }}>
            Authorised Signatory
          </p>
        </div>

        <p style={{ marginTop: 20, fontSize: 11, color: "#71717a" }}>
          This is a system-generated certificate based on the employee&apos;s salary records and is
          valid for verification of employment and current remuneration.
        </p>
      </div>
    </Letterhead>
  );
}

export default SalaryCertificate;
