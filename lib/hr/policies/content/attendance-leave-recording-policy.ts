import { DEFAULT_ADDRESS_LINE } from "@/lib/hr/entities";
import { type PolicyDoc, declaration, heading, p, ul } from "@/lib/hr/policies/types";

const attendanceLeaveRecordingPolicy: PolicyDoc = {
  key: "attendance-leave-recording-policy",
  title: "Attendance & Leave Recording Policy",
  docCode: "HR-POL-009",
  effectiveDate: "1 October 2026",
  version: "1.0",
  owner: "Human Resources / Management",
  registeredOffice: DEFAULT_ADDRESS_LINE,
  hrEmail: "Human Resources Department",
  entityDefault: "altus-corp",
  summary: "Employee responsibilities for recording attendance, leave, corrections and missed punches in Altus OS.",
  sections: [
    heading(
      "Attendance and Leave Recording",
      p("Altus OS Attendance is the official system for recording employee attendance and leave. Every employee is responsible for ensuring that attendance and leave records are correctly updated and verified."),
    ),
    heading(
      "Leave Application",
      p("Planned leave must be applied for and approved in advance wherever possible. Employees must inform HR or Management and ensure that leave is recorded under My Leaves in Altus OS Attendance."),
      ul(
        "Employees may apply for leave directly through Altus OS Attendance using their mobile phones.",
        "After applying, employees must check that the entry has been successfully recorded and inform HR or Management.",
      ),
    ),
    heading(
      "Emergency Leave",
      p("In an emergency or sudden absence, the employee must inform HR or Management as soon as possible and ensure that the leave is subsequently recorded in Altus OS Attendance."),
    ),
    heading(
      "Unrecorded Absence and Penalty",
      p("Informing HR or Management about an absence is not sufficient when the leave or absence is not recorded in Altus OS Attendance. Failure to record an absence in Altus OS and notify HR or Management will be treated as an unrecorded absence and may result in double attendance deduction or forfeiture for that absence."),
    ),
    heading(
      "Attendance Discrepancies",
      p("Incorrect or missing attendance or leave entries must be reported to HR or Management immediately for correction. Employees are responsible for regularly checking their attendance and leave records."),
    ),
    heading(
      "Missed Attendance Punch",
      p("Any missed attendance punch, login or logout must be reported to HR or Management immediately; otherwise it may be marked absent. Repeated or unexplained missed punches may be treated as an attendance violation and may be subject to Management action."),
    ),
    heading(
      "Management Discretion",
      p("Genuine exceptional circumstances may be reviewed by Management on a case-by-case basis. Management's decision regarding attendance and leave discrepancies will be final."),
    ),
  ],
  declaration: declaration(),
};

export default attendanceLeaveRecordingPolicy;
