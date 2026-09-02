/**
 * Exact field schema of the "Altus Candidate Walk-in Interview Form"
 * (Google Form, 108 items) — extracted verbatim from the live form's
 * FB_PUBLIC_LOAD_DATA_ on 2026-07-24. This is the source of truth for building
 * the Pre-Interview → Basic Details screen (/hr/pre-interview/basic-details).
 *
 * Titles are cleaned (trailing ":" / newlines trimmed). `kind`: text | date |
 * paragraph | choice | checkbox | file. Repeated blocks (5× education, 2×
 * work-experience, 2× family) are grouped under their section headers.
 */
export type BasicFieldKind = "text" | "date" | "paragraph" | "choice" | "checkbox" | "file";

export interface BasicField {
  label: string;
  kind: BasicFieldKind;
  required: boolean;
  options?: string[];
}

export interface BasicSection {
  title: string;
  /** Repeated section variant, e.g. "10th", "12th", "Graduation". */
  variant?: string;
  fields: BasicField[];
}

export const BASIC_DETAILS_SECTIONS: BasicSection[] = [
  {
    title: "Personal Details",
    fields: [
      { label: "Position Applied", kind: "text", required: true },
      { label: "Full Name", kind: "text", required: true },
      { label: "Date of Birth", kind: "date", required: true },
      { label: "Age", kind: "text", required: true },
      { label: "Gender", kind: "choice", required: true, options: ["Male", "Female", "Prefer not to say"] },
      { label: "Marital Status", kind: "text", required: true },
      { label: "Children", kind: "text", required: true },
      { label: "Owned House", kind: "text", required: true },
      { label: "Rented", kind: "text", required: true },
      { label: "How Much Rent", kind: "text", required: true },
      { label: "Native Place", kind: "text", required: true },
      { label: "How Big", kind: "text", required: true },
      { label: "Bathroom", kind: "choice", required: true, options: ["In", "Out"] },
      { label: "Mobile Number", kind: "text", required: true },
      { label: "Current Location", kind: "text", required: true },
      { label: "E-mail Address", kind: "text", required: true },
      { label: "Have you been interviewed by us in the last six months?", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "Do you smoke?", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "Do you consume alcohol?", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "Differently Abled?", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "Do you have a police record?", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "Do you have a history of any major illness?", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "How did you learn about the opening?", kind: "checkbox", required: true, options: ["Newspaper Advertisement", "Company Website", "Friend or Relative", "Job Portal / HR agency", "Social Media", "Other"] },
    ],
  },
  {
    title: "Educational Qualifications", variant: "10th",
    fields: [
      { label: "Degree (10th)", kind: "text", required: true },
      { label: "Name of the school (10th)", kind: "text", required: true },
      { label: "Board / University (10th)", kind: "text", required: true },
      { label: "Regular / Part-Time (10th)", kind: "text", required: true },
      { label: "Month and Year of Passing (10th)", kind: "text", required: true },
      { label: "No. of Attempts (10th)", kind: "text", required: true },
      { label: "Percentage (10th)", kind: "text", required: true },
    ],
  },
  {
    title: "Educational Qualifications", variant: "12th",
    fields: [
      { label: "Degree (12th)", kind: "text", required: true },
      { label: "Name of the School / College (12th)", kind: "text", required: true },
      { label: "Board / University (12th)", kind: "text", required: true },
      { label: "Regular / Part-time (12th)", kind: "text", required: true },
      { label: "Month and year of passing (12th)", kind: "text", required: true },
      { label: "No. of Attempts (12th)", kind: "text", required: true },
      { label: "Percentage (12th)", kind: "text", required: true },
    ],
  },
  {
    title: "Educational Qualifications", variant: "Higher #1",
    fields: [
      { label: "Degree", kind: "text", required: false },
      { label: "Name of the school / college", kind: "text", required: false },
      { label: "Board / University", kind: "text", required: false },
      { label: "Regular / Part-time", kind: "text", required: false },
      { label: "Month and year of passing", kind: "text", required: false },
      { label: "No. of attempts", kind: "text", required: false },
      { label: "Percentage", kind: "text", required: false },
    ],
  },
  {
    title: "Educational Qualifications", variant: "Higher #2",
    fields: [
      { label: "Degree", kind: "text", required: false },
      { label: "Name of the school / college", kind: "text", required: false },
      { label: "Board / University", kind: "text", required: false },
      { label: "Regular / Part-time", kind: "text", required: false },
      { label: "Month and year of passing", kind: "text", required: false },
      { label: "No. of attempts", kind: "text", required: false },
      { label: "Percentage", kind: "text", required: false },
    ],
  },
  {
    title: "Educational Qualifications", variant: "Higher #3",
    fields: [
      { label: "Degree", kind: "text", required: false },
      { label: "Name of the school / college", kind: "text", required: false },
      { label: "Board / University", kind: "text", required: false },
      { label: "Regular / Part-time", kind: "text", required: false },
      { label: "Month and Year of Passing", kind: "text", required: false },
      { label: "No. of attempts", kind: "text", required: false },
      { label: "Percentage", kind: "text", required: false },
    ],
  },
  {
    title: "Academic Summary",
    fields: [
      { label: "Academic Gap", kind: "choice", required: true, options: ["Yes", "No"] },
      { label: "Number of Backlogs / ATKTs, if any", kind: "text", required: true },
    ],
  },
  {
    title: "Work Experience", variant: "Current",
    fields: [
      { label: "Current Organization", kind: "text", required: false },
      { label: "Current Designation", kind: "text", required: false },
      { label: "Whom do you report to? Designation", kind: "text", required: false },
      { label: "Name (of person you report to)", kind: "text", required: false },
      { label: "Number of People Reporting to You", kind: "text", required: false },
      { label: "Total experience", kind: "text", required: false },
      { label: "Fixed Salary", kind: "text", required: false },
      { label: "Bonus / Incentive", kind: "text", required: false },
      { label: "Total Salary", kind: "text", required: false },
      { label: "Expected Salary", kind: "text", required: false },
      { label: "Previous Job Working Timings", kind: "text", required: false },
      { label: "Saturday or Sunday Working", kind: "text", required: false },
      { label: "Open to work on Sunday", kind: "text", required: false },
      { label: "Total nos. of Jobs", kind: "text", required: false },
      { label: "Can you sit till 9 pm", kind: "choice", required: false, options: ["Yes", "No"] },
      { label: "Language Known", kind: "text", required: false },
    ],
  },
  {
    title: "Work Experience", variant: "Previous",
    fields: [
      { label: "From", kind: "date", required: false },
      { label: "To", kind: "date", required: false },
      { label: "Organisation", kind: "text", required: false },
      { label: "Designation", kind: "text", required: false },
      { label: "Reason for Leaving", kind: "paragraph", required: false },
      { label: "Please mention career gap if any", kind: "text", required: false },
    ],
  },
  {
    title: "Family Details", variant: "Member #1",
    fields: [
      { label: "Name", kind: "text", required: true },
      { label: "Relationship", kind: "text", required: true },
      { label: "Sex", kind: "text", required: true },
      { label: "Age", kind: "text", required: true },
      { label: "Occupation", kind: "text", required: true },
    ],
  },
  {
    title: "Family Details", variant: "Member #2",
    fields: [
      { label: "Name", kind: "text", required: true },
      { label: "Relationship", kind: "text", required: true },
      { label: "Sex", kind: "text", required: true },
      { label: "Age", kind: "text", required: true },
      { label: "Occupation", kind: "text", required: true },
    ],
  },
  {
    title: "Declaration & Sign-off",
    fields: [
      { label: "Affix your recent coloured, passport-sized photograph", kind: "file", required: true },
      { label: "Candidate's Signature", kind: "file", required: true },
      { label: "Recruiter's Remarks", kind: "paragraph", required: true },
      { label: "Name", kind: "text", required: true },
      { label: "Date", kind: "date", required: true },
    ],
  },
];
