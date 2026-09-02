/**
 * ATTENDANCE POLICY.
 *
 * Verbatim transcription of the source Attendance Policy into the declarative
 * `PolicyDoc` model — working hours, half-day criteria, the weekly discipline
 * waiver, reporting, management deductions, ex-gratia credits, comp-off, WFH,
 * and the standardized attendance LEGEND (rendered as a premium code-chip grid
 * via the `legend()` node). FROZEN legal text, no editable fields. Registered in
 * the policy registry + flips its POLICY_CARDS entry to status:"ready".
 *
 * "the Firm" is the source's own generic self-reference; the sign-off firm name
 * resolves from the selected entity via the `{firm}` token layer.
 *
 * PURE + CLIENT-SAFE: imports only ./types (which is itself load-neutral).
 */

import {
  type PolicyDoc,
  heading,
  p,
  sub,
  ul,
  legend,
  declaration,
} from "@/lib/hr/policies/types";

const attendancePolicy: PolicyDoc = {
  key: "attendance-policy",
  title: "Attendance Policy",
  docCode: "HR-POL-006",
  effectiveDate: "01 June 2026",
  version: "1.0",
  owner: "Human Resources Department / Founder",
  registeredOffice:
    "C-6, Ground Floor, Gambhir Estates, Sacred Space (Synergy Road), Kotkar Road, Off Aarey Road, Next to Pravasi Industrial Estate, Hanuman Tekdi, Goregaon East, Mumbai – 400063, Maharashtra, India",
  hrEmail: "hr.altuscorp@gmail.com",
  entityDefault: "altus-corp",
  summary:
    "Working hours, half-day criteria, the weekly discipline waiver, attendance reporting, management-approved deductions & ex-gratia credits, comp-off, work-from-home and the standardized attendance legend.",

  sections: [
    /* 1 ─────────────────────────────────────────────────────────── */
    heading(
      "Working Hours",
      ul(
        "Every full time employee is expected to complete 9 working hours per working day.",
        "Every part time employee is expected to complete 5 working hours.",
        "Attendance shall be calculated based on the employee's total working hours recorded in the attendance system.",
      ),
    ),

    /* 2 ─────────────────────────────────────────────────────────── */
    heading(
      "Half-Day Criteria",
      ul(
        "An employee who completes at least 7.5 working hours on a working day is credited a Full Day. From 4.5 up to 7.5 hours the day shall be treated as a Half Day; below 4.5 hours the day is treated as Absent.",
        "If an employee completes less than 4.5 working hours, the day shall be treated as Absent, unless otherwise approved by Management.",
        "Any exception due to official duty, approved leave, or management approval must be documented.",
      ),
    ),

    /* 3 ─────────────────────────────────────────────────────────── */
    heading(
      "Weekly Discipline Waiver",
      p("To encourage overall discipline and productivity, the Firm provides a weekly waiver mechanism."),
      p(
        "If an employee completes 54 or more working hours in a calendar week, the following attendance deviations for that week shall be automatically waived:",
      ),
      ul("Late Check-in Marks", "Early Check-out Marks", "Half-Day Marks (where eligible under Firm rules)"),
      p("This waiver recognizes employees who compensate for lost time by completing the required weekly working hours."),
    ),

    /* 4 ─────────────────────────────────────────────────────────── */
    heading(
      "Attendance Reporting",
      p("Attendance reports shall always display attendance in relation to the total scheduled working days for the applicable period."),
      sub("Examples"),
      ul("3/30 days Late", "3/30 days Late (Waived Off)", "8/90 days Late", "6/90 days Late (Waived Off)"),
      p("Where applicable, the system shall also display the corresponding percentage to measure attendance discipline, for example:"),
      ul(
        "Late Attendance: 3/30 (10.00%)",
        "Late Attendance Waived: 3/30 (10.00%)",
        "Late Attendance: 8/90 (8.89%)",
        "Late Attendance Waived: 6/90 (6.67%)",
      ),
      p("These reports are intended to reflect attendance discipline over time and may be considered during performance reviews or disciplinary evaluations."),
    ),

    /* 5 ─────────────────────────────────────────────────────────── */
    heading(
      "Management-Approved Attendance Deductions",
      p("Management reserves the right to direct attendance deductions as part of disciplinary action."),
      ul(
        "Such deductions may be applied irrespective of the employee's physical attendance.",
        "The Accounts Department shall deduct the specified number of attendance days before final salary processing.",
      ),
      sub("Example"),
      ul(
        "Employee attended 30 out of 30 days.",
        "Management imposes a disciplinary deduction of 3 attendance days for failure to perform assigned responsibilities (e.g., failure to submit a mandatory report).",
        "Salary shall be calculated on 27 payable attendance days.",
      ),
      p("For every deduction, the following are mandatory:"),
      ul(
        "Number of attendance days deducted.",
        "Reason for deduction.",
        "Approval by the authorized management representative.",
      ),
    ),

    /* 6 ─────────────────────────────────────────────────────────── */
    heading(
      "Management-Approved Ex Gratia Attendance Credit",
      p("Management may grant additional payable attendance days as an Ex Gratia Attendance Credit in deserving cases."),
      p("This may be provided for:"),
      ul(
        "Festival holidays.",
        "Special assignments.",
        "Exceptional contribution.",
        "Additional work done beyond working hours.",
        "Additional number of hours above 54 hours in a week.",
        "Any other management-approved reason.",
      ),
      sub("Example"),
      ul(
        "The employee was present for 28 working days.",
        "Management grants 2 Ex Gratia Attendance Days due to an approved festival benefit.",
        "Payable attendance becomes 30 days, and salary shall be processed accordingly.",
      ),
      p("For every Ex Gratia Attendance Credit, the following are mandatory:"),
      ul(
        "Number of attendance days credited.",
        "Reason for the Ex Gratia credit.",
        "Approval by the authorized management representative.",
      ),
    ),

    /* 7 ─────────────────────────────────────────────────────────── */
    heading(
      "Compensatory Off (Comp-Off)",
      p("An employee may be granted a Compensatory Off (Comp-Off) for authorized work performed on a weekly off, declared holiday, or any other non-working day, subject to prior approval from Management."),
      p("Comp-Off shall not be considered an automatic entitlement merely because an employee has worked additional hours or attended work on a non-working day."),
      p("All Comp-Off credits must be approved by the authorized Management representative and recorded in the attendance system."),
      p("An employee must obtain approval before availing a Comp-Off. An absence taken without such approval shall be treated according to the applicable attendance and leave rules."),
      p("The grant, validity, adjustment, expiry, or cancellation of any Comp-Off shall remain subject to Management approval and applicable Firm rules."),
    ),

    /* 8 ─────────────────────────────────────────────────────────── */
    heading(
      "Work From Home (WFH)",
      p("Work From Home (WFH) is not permitted as a regular mode of working."),
      p("WFH may be allowed only under special circumstances and with prior approval from the authorized Management representative."),
      p("An employee shall not assume that WFH has been approved merely by informing a reporting manager, colleague, or the Human Resources Department. Explicit approval must be obtained and documented."),
      p("Where WFH is approved, the employee shall remain available during the applicable working hours, perform assigned responsibilities, and comply with all reporting, productivity, communication, and attendance requirements prescribed by the Firm."),
      p("Working from home without the required approval may be treated as unauthorized absence and attendance may be marked accordingly."),
      p("Management reserves the right to approve, reject, modify, or withdraw WFH permission based on business requirements and the circumstances of each case."),
    ),

    /* 9 ─────────────────────────────────────────────────────────── */
    heading(
      "Attendance Legend",
      p("The attendance system and attendance reports may use the following legends for identification and reporting purposes:"),
      legend([
        { code: "P", meaning: "Present" },
        { code: "A", meaning: "Absent" },
        { code: "HD", meaning: "Half Day" },
        { code: "L", meaning: "Late Check-in" },
        { code: "EC", meaning: "Early Check-out" },
        { code: "WO", meaning: "Weekly Off" },
        { code: "H", meaning: "Holiday" },
        { code: "CL", meaning: "Casual Leave" },
        { code: "SL", meaning: "Sick Leave" },
        { code: "PL", meaning: "Privilege / Paid Leave" },
        { code: "UL", meaning: "Unpaid Leave" },
        { code: "WFH", meaning: "Work From Home – Approved" },
        { code: "CO", meaning: "Compensatory Off" },
        { code: "OD", meaning: "Official Duty" },
        { code: "WOFF", meaning: "Attendance Deviation Waived Off" },
        { code: "EG", meaning: "Ex Gratia Attendance Credit" },
        { code: "MD", meaning: "Management-Approved Attendance Deduction" },
      ]),
      p("The legend is intended to provide a standardized representation of attendance status. Where multiple attendance conditions apply on the same day, the attendance system may display the applicable primary and secondary status as per Firm rules."),
    ),

    /* 10 ────────────────────────────────────────────────────────── */
    heading(
      "Final Authority",
      p("The interpretation, application, waiver, deduction, or grant of attendance benefits under this policy shall remain at the sole discretion of Management. All attendance adjustments shall be properly documented and approved before payroll processing."),
      p("Any failure to comply with the attendance policy over a long period of time may result in termination of employment with immediate effect."),
    ),
  ],

  /* Declaration & Acknowledgement — shared sign-off block ─────────── */
  declaration: declaration(),
};

export default attendancePolicy;
