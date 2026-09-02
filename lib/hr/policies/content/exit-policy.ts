/**
 * HR POLICY — Prevention & Management of Employee Separation (Exit Policy).
 *
 * Authored VERBATIM from the source document (HR-POL-002). A `PolicyDoc` built
 * with the declarative builders in ../types. Pure + client-safe (imports only
 * ./types). Registered into POLICIES by the Assemble phase — do NOT edit the
 * registry here.
 */

import {
  type PolicyDoc,
  heading,
  p,
  sub,
  ul,
  table,
  workflow,
  declaration,
} from "../types";

const exitPolicy: PolicyDoc = {
  key: "exit-policy",
  title: "Prevention & Management of Employee Separation (Exit Policy)",
  docCode: "HR-POL-002",
  effectiveDate: "01 June 2026",
  version: "1.0",
  owner: "Human Resources Department / Founder",
  registeredOffice:
    "C-6, Ground Floor, Gambhir Estates, Sacred Space (Synergy Road), Kotkar Road, Off Aarey Road, Next to Pravasi Industrial Estate, Hanuman Tekdi, Goregaon East, Mumbai – 400063, Maharashtra, India",
  hrEmail: "hr.altuscorp@gmail.com",
  entityDefault: "altus-corp",
  summary:
    "Corporate Framework for a Secure, Compliant, and Professional Separation.",

  sections: [
    heading(
      "Introduction & Objective",
      p(
        "{firm} is committed to ensuring that employee separations are handled with the highest level of professionalism, legal compliance, and operational security. This policy establishes a standardized, equitable process for managing voluntary and involuntary separations while safeguarding {firm}'s intellectual property, client relationships, and business continuity.",
      ),
    ),

    heading(
      "Scope and Applicability",
      p(
        "This policy applies to all personnel on the {firm} payroll, including permanent, probationary, part-time, and fixed-term contract employees globally.",
      ),
    ),

    heading(
      "Categories of Separation",
      p(
        "Initiated by the employee serving standard notice.",
        "Voluntary Resignation:",
      ),
      p(
        "Immediate dismissal due to severe disciplinary breaches (e.g., POSH violations, fraud, insubordination, or data theft).",
        "Involuntary Termination (For Cause):",
      ),
      p(
        "Separation initiated by the firm following a failed Performance Improvement Plan (PIP).",
        "Involuntary Termination (Performance):",
      ),
      p(
        "Role elimination due to business pivot, financial constraints, or automation.",
        "Redundancy / Restructuring:",
      ),
      p(
        "Unexplained and unauthorized absence for a consecutive period of three (3) or more working days without notifying the reporting manager or HR.",
        "Job Abandonment (Absconding):",
      ),
    ),

    heading(
      "Notice Period & Garden Leave Protocols",
      sub("4.1 Notice Period Durations"),
      p(
        "All voluntary resignations are subject to the notice periods stipulated in the individual's employment agreement. Standard guidelines are:",
      ),
      table({
        variant: "grid",
        columns: ["Category", "Notice Period"],
        rows: [
          ["Probationary Employees", "15 days."],
          ["Confirmed Employees (Non-Management)", "30 days."],
          ["Senior Management & Critical Roles", "60 to 90 days."],
        ],
      }),

      sub("4.2 Salary in Lieu of Notice (Buy-Out)"),
      p(
        "{firm} reserves the absolute right to accept, reject, or negotiate notice period buyouts. If an employee requests an early release, management may permit them to pay the firm their gross salary in lieu of the unserved days. Conversely, {firm} may terminate employment immediately by paying the employee's base salary in lieu of notice.",
      ),

      sub("4.3 Garden Leave"),
      p(
        "During the notice period, {firm} reserves the right to place the resigning employee on \"Garden Leave.\" Under this status:",
      ),
      ul(
        "The employee remains on the payroll and receives full salary and benefits.",
        "The employee is relieved of all active duties and must not access firm premises, networks, or contact clients/colleagues without HR approval.",
        "The employee must remain available during standard working hours to answer transition-related queries.",
      ),

      sub("4.4 Resignation Acceptance"),
      p(
        "The submission of a resignation letter does not, by itself, constitute its acceptance. A resignation becomes effective only upon written acceptance by Human Resources, approval by Management, and confirmation of the Last Working Day (LWD). Until such confirmation is issued, the employee continues to be treated as being in active employment with {firm} and remains bound by all applicable terms of employment.",
      ),

      sub("4.5 Firm's Rights During the Notice Period"),
      p(
        "To ensure business continuity, client servicing, operational efficiency, protection of confidential information, and a smooth business transition, {firm} reserves the right, at its sole discretion and at any time during the notice period, to:",
      ),
      ul(
        "Transfer the employee's reporting manager, alter the reporting structure, or modify job responsibilities, including the withdrawal of client-facing duties.",
        "Restrict or revoke the employee's access to confidential projects, confidential information, internal systems, and repositories.",
        "Reassign ongoing projects, clients, or business accounts to another employee or team.",
        "Place the employee on Garden Leave, in accordance with Clause 4.3, whenever considered necessary.",
      ),

      sub("4.6 Extension of Notice Period"),
      p(
        "Where Knowledge Transfer, documentation, client transition, or handover remains incomplete, or where Firm assets remain pending return or applicable Firm standards have not been met, Mr. Manan Vasa, Founder, reserves the right to approve or recommend an extension of the employee's notice period, subject to the applicable employment terms and business requirements. Any such extension shall continue only for the period reasonably required to complete the pending obligations and shall be communicated to the employee in writing by Human Resources.",
      ),
    ),

    heading(
      "Separation Workflow & Knowledge Transfer (KT)",
      p(
        "Resignation must be submitted in writing to the reporting manager and hr.altuscorp@gmail.com. manan@unleashed.in",
        "Formal Notification:",
      ),
      p(
        "Every employee shall complete a comprehensive handover, duly signed off by the reporting manager, covering, wherever applicable, the following:",
        "KT Documentation:",
      ),
      table({
        variant: "grid",
        rows: [
          ["Client Contacts", "Password Vault"],
          ["Login Credentials", "Project Documentation"],
          ["SOPs", "Vendor Contacts"],
          ["Open Quotations", "Licenses"],
          ["Pending Approvals", "Ongoing Negotiations"],
          ["Source Code Repositories", "Shared Drives"],
          ["API Keys", "Business Records"],
          ["Internal Documents", "Access Credentials"],
          ["Pending Tasks", "Active Projects"],
          ["Hand-Holding Session Completed", "CRM Notes Duly Filled"],
          ["Handover Videos Recorded", "Updation of Masters, Sheets & Trackers"],
          [
            "File & Folder Path Documentation (per Assignment / Client)",
            "Source Codes & Claude Chat Backups",
          ],
          ["ChatGPT Chat Backups & Data Dumps", ""],
        ],
      }),
      p(
        "Human Resources or Management may request any further information considered necessary to complete the handover. Failure to complete a proper handover may delay clearance and the Full and Final (F&F) Settlement.",
      ),
      p(
        "The employee must obtain digital or physical \"No Dues\" clearances from the IT Department (hardware, access), Finance Department (travel advances, credit cards, loans), HR & Administration (ID cards, keys, parking passes) and Management.",
        "Clearance Matrix:",
      ),
      p(
        "Participation in a mandatory, confidential exit interview with Human Resources is expected of all separating employees. Honest and constructive feedback is encouraged, will be treated in strict confidence, and will not adversely affect the employee's relieving documents or Full and Final (F&F) Settlement.",
        "Exit Interview:",
      ),
      p(
        "As directed by Mr. Manan Vasa, Founder, all communication with clients regarding an employee's resignation shall be determined solely by the Firm, having regard to the client relationship, the nature of the work involved, business continuity, and prevailing circumstances. Depending on these factors, the client may be informed by Mr. Manan Vasa, a newly assigned Client Manager or Relationship Manager, or, only where specifically instructed by Mr. Manan Vasa, the exiting employee.",
        "Client Communication During Exit:",
      ),
      p(
        "Employees are not permitted to independently inform clients of their resignation, replacement, transition, or any related Firm decision without prior approval from Mr. Manan Vasa, who shall determine the timing, mode of communication, and person responsible for informing the client, in order to protect client relationships and business continuity. All external communication relating to an employee's resignation, transition, or separation shall remain confidential until officially communicated by Mr. Manan Vasa (Founder) or an authorised representative of {firm}.",
      ),
    ),

    heading(
      "Intellectual Property (IP), Data Security & Asset Recovery",
      p(
        "Employees are strictly prohibited from downloading or copying confidential data; deleting or altering business records; forwarding firm emails; sharing passwords; uploading Firm data to personal cloud storage; or otherwise transferring or retaining confidential information and Firm documents. Any violation of this clause may result in disciplinary action and legal proceedings. Employees shall not retain, store, reproduce, or keep copies of Firm information in any form, including electronic files, printed documents, screenshots, cloud storage, portable storage devices, or personal systems after separation from the Firm.",
        "Data Security:",
      ),
      p(
        "All work produced during the employee's tenure remains the exclusive intellectual property of {firm}.",
        "IP Ownership:",
      ),
      sub("Firm Property & Digital Access"),
      p(
        "On or before the Last Working Day, employees must return all Firm property in their possession, including laptops, desktops, mobile phones, chargers, SIM cards, ID cards, access cards, office keys, USB devices, hard drives, security tokens, software licenses, authentication devices, Firm documents, and any other Firm property. Failure to return such assets in working condition will result in their depreciated value being deducted directly from the Full and Final (F&F) Settlement.",
        "Asset Return:",
      ),
      p(
        "{firm} may revoke, on or before the Last Working Day, the employee's access to email, VPN, cloud storage, shared drives, internal software, source code repositories, ERP, CRM, and other Firm accounts.",
      ),
    ),

    heading(
      "Post-Employment Obligations",
      p(
        "Departing employees remain bound by the terms of their initial Non-Disclosure Agreement (NDA).",
      ),
      p(
        "Employees may not solicit, poach, or hire {firm} staff, nor may they solicit {firm} clients for a period of twenty-four (24) months following separation.",
        "Non-Solicitation:",
      ),
      p(
        "Both the departing employee and {firm} agree not to publish or make false, misleading, malicious, or defamatory statements about each other – including about the Firm's Management, employees, clients, products, or services – whether on social media, LinkedIn, Glassdoor, Google, Indeed, AmbitionBox, blogs, online forums, discussion boards, public interviews, podcasts, webinars, newspapers, digital or print media, public speaking engagements, review websites, or any other public communication platform. This clause does not restrict disclosures required by applicable law or communications made to lawful regulatory or governmental authorities.",
        "Non-Disparagement:",
      ),
    ),

    heading(
      "Full and Final (F&F) Settlement",
      p(
        "The F&F settlement will be calculated and credited to the employee's salary account within forty-five (45) days of the final working date, subject to the successful completion of the clearance matrix. This includes salary till the Last Working Day, leave encashment, bonus (if applicable), incentives, variable pay, gratuity (if eligible), expense reimbursements, and approved claims, less any applicable notice pay adjustment, loan recovery, asset recovery, or other lawful deductions. The settlement shall be processed in accordance with Firm policy, the employee's employment contract, and applicable Indian laws.",
      ),
    ),

    heading(
      "Re-hire Policy",
      p(
        "Employees who leave voluntarily in good standing (having served full notice and completed proper handover) are eligible for re-hire after a cooling-off period of six (6) months.",
      ),
      p(
        "Employees terminated for cause, performance, or absconding are permanently placed on a \"Do Not Hire\" list.",
      ),
      p(
        "Eligibility for re-employment further depends on business requirements, position availability, background verification, the employee's previous employment record, and Management approval.",
      ),
    ),

    heading(
      "Governing Law & Jurisdiction",
      p(
        "This Exit Policy shall be governed by and construed in accordance with the laws of India. Any dispute, claim, interpretation, or legal proceeding arising out of or in connection with an employee's separation or this policy shall be subject to the exclusive jurisdiction of the competent courts situated in Mumbai, Maharashtra, India.",
      ),
    ),
  ],

  declaration: declaration(),
};

export default exitPolicy;
