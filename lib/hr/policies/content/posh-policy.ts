/**
 * POSH POLICY — "Prevention of Sexual Harassment (POSH) Policy".
 *
 * Verbatim transcription of the Altus Corp POSH policy (9-page source document,
 * sections 1–18) into the declarative `PolicyDoc` model. Authored against
 * lib/hr/policies/types.ts — FROZEN legal text, no editable fields. The Assemble
 * phase imports this default export and registers it in the policy registry
 * (key → PolicyDoc) + flips its POLICY_CARDS entry to status:"ready".
 *
 * PURE + CLIENT-SAFE: imports only ./types (which is itself load-neutral).
 */

import {
  type PolicyDoc,
  heading,
  p,
  sub,
  ul,
  table,
  committee,
  workflow,
  declaration,
} from "@/lib/hr/policies/types";

const poshPolicy: PolicyDoc = {
  key: "posh-policy",
  title: "Prevention of Sexual Harassment (POSH) Policy",
  docCode: "HR-POL-001",
  effectiveDate: "01 June 2026",
  version: "1.0",
  owner: "Human Resources Department / Founder",
  registeredOffice:
    "C-6, Ground Floor, Gambhir Estates, Sacred Space (Synergy Road), Kotkar Road, Off Aarey Road, Next to Pravasi Industrial Estate, Hanuman Tekdi, Goregaon East, Mumbai – 400063, Maharashtra, India",
  hrEmail: "hr.altuscorp@gmail.com",
  entityDefault: "altus-corp",
  summary: "Enterprise Framework for a Safe, Respectful, and Dignified Workplace.",

  sections: [
    /* 1 ─────────────────────────────────────────────────────────── */
    heading(
      "Introduction & Purpose",
      p(
        "{firm} is dedicated to fostering a healthy, safe, and inspiring work environment that enables all employees to perform to their highest potential. We operate on a foundation of mutual respect, dignity, and professional integrity.",
      ),
      p(
        "The purpose of this Prevention of Sexual Harassment (POSH) Policy is to clearly state {firm}'s zero-tolerance stance toward sexual harassment in the workplace. This document outlines the mechanisms for preventing, reporting, and redressing any incidents of sexual harassment, ensuring that every individual associated with the firm feels secure, valued, and protected.",
      ),
    ),

    /* 2 ─────────────────────────────────────────────────────────── */
    heading(
      "Policy Statement & Scope",
      sub("2.1 Policy Statement"),
      p(
        "{firm} maintains a strict zero-tolerance policy against any form of sexual harassment. Any act of sexual harassment is considered a severe form of misconduct and will attract immediate and stringent disciplinary action, up to and including termination of employment.",
      ),
      sub("2.2 Scope and Coverage"),
      p(
        "This policy applies to all individuals employed by or associated with {firm}. Its jurisdiction extends to:",
      ),
      ul(
        "Personnel: All full-time, part-time, probationary, temporary, contractual, apprentice, trainee, and freelance workers, as well as interns, consultants, interview candidates, vendors, clients, visitors, contractors, and delivery personnel.",
        "Workplace: The registered office, any branch offices, client locations, and any off-site venues where business activities occur (including Enterprise events, business travel, transport provided by the firm, and official social gatherings).",
        "Digital Workplace: All virtual environments, including official emails, Google Meet, Teams communications, WhatsApp messages, Meetings, Trainings, Workshops, Video conferences, and any online platforms utilized for {firm} business operations.",
      ),
    ),

    /* 3 ─────────────────────────────────────────────────────────── */
    heading(
      "Legal Framework (India)",
      p(
        "This policy is formulated in strict compliance with The Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 (commonly referred to as the 'POSH Act') along with its corresponding rules.",
      ),
      p(
        "While Indian statutory law explicitly protects aggrieved women under the POSH Act, {firm} believes in an inclusive work culture. Therefore, our internal Enterprise framework extends protection and a redressal mechanism to all employees, regardless of gender, gender identity, or sexual orientation, ensuring equal dignity for everyone.",
        "Enterprise Inclusion Note: ",
      ),
    ),

    /* 4 ─────────────────────────────────────────────────────────── */
    heading(
      "Definitions",
      ul(
        "Aggrieved Individual: Any person, whether employed with {firm} or not, who alleges having been subjected to any act of sexual harassment by a respondent at the workplace. This explicitly covers harassment suffered by or caused by clients, vendors, visitors, contractors, interview candidates, consultants, Delivery personnel and Interns.",
        "Respondent: Any person against whom the aggrieved individual has lodged a formal complaint of sexual harassment.",
        "Workplace: Any place visited by the employee arising out of or during the course of employment, including transportation provided by the employer for undertaking such a journey.",
        "Internal Complaints Committee (ICC): The designated committee constituted by {firm} management to investigate, evaluate, and redress complaints related to sexual harassment.",
      ),
    ),

    /* 5 ─────────────────────────────────────────────────────────── */
    heading(
      "Guiding Principles",
      p("{firm}'s POSH framework operates under five core principles:"),
      table({
        variant: "principle",
        columns: ["Principle", "Description"],
        rows: [
          ["Zero Tolerance", "No incident of sexual harassment will be overlooked, minimized, or ignored."],
          [
            "Natural Justice",
            "Both the complainant and the respondent will be given a fair, unbiased, and equal opportunity to present their case.",
          ],
          [
            "Absolute Confidentiality",
            "Identities of all parties and details of the proceedings will remain strictly protected throughout and after the inquiry.",
          ],
          [
            "Time-Bound Redressal",
            "All complaints will be acknowledged, investigated, and resolved within the strict timelines mandated by law.",
          ],
          [
            "Non-Retaliation",
            "Protection will be guaranteed to the complainant and witnesses against any victimization or adverse consequences.",
          ],
        ],
      }),
    ),

    /* 6 ─────────────────────────────────────────────────────────── */
    heading(
      "Standards Of Professional Conducts & Relationship Boundaries",
      sub("6.1 General Conduct"),
      p(
        "All members of the {firm} ecosystem are expected to maintain an environment free from intimidation and hostility. Professional conduct dictates that:",
      ),
      ul(
        "Interactions between colleagues must remain respectful, courteous, and bound by professional limits.",
        "Stereotypes, offensive jokes, and inappropriate personal remarks regarding an individual's gender, appearance, or lifestyle are strictly prohibited.",
        "The personal boundaries of every individual must be recognized and respected at all times.",
      ),
      sub("6.2 Personal Relationship Policy (Cooling-Off Period)"),
      p(
        "To maintain absolute professional integrity, minimize conflicts of interest, and prevent a hostile or biased work environment, {firm} enforces a strict boundary policy.",
      ),
      p(
        "No romantic or sexual involvement of any kind is permitted between any colleague, customer, associate, supplier, vendor, or participant while actively in the employment of {firm}. Personal relationships of this nature may only be pursued after a strict 31-day cooling-off period calculated from the individual's last official day of employment with the firm.",
      ),
    ),

    /* 7 ─────────────────────────────────────────────────────────── */
    heading(
      "Understanding Sexual Harassment (With Expanded Examples)",
      sub("7.1 Core Definition"),
      p(
        "Sexual harassment includes any one or more of the following unwelcome acts or behavior (whether directly or by implication):",
      ),
      ul(
        "Physical contact and advances; a demand or request for sexual favors; making sexually colored remarks; showing pornography or any explicit visual material; or any other unwelcome physical, verbal, or non-verbal conduct of a sexual nature.",
      ),
      sub("7.2 Explicit and Implicit Situations"),
      ul(
        "Quid Pro Quo ('This for That'): Implied or explicit promise of preferential treatment, or threat of detrimental treatment, in employment in exchange for sexual favors.",
        "Hostile Work Environment: Creating an intimidating, offensive, or hostile work atmosphere that interferes with an individual's work performance.",
      ),
      sub("7.3 Illustrative and Expanded Examples"),
      p("To provide extra clarity, sexual harassment includes, but is not limited to:"),
      ul(
        "Verbal: Sexually suggestive jokes, comments about body/clothing, unwanted romantic advances, invasive questions about personal life, sexist remarks, or making repeated compliments that cause visible or expressed discomfort.",
        "Non-Verbal & Digital: Staring, leering, stalking, recording individuals without their explicit consent, sending late-night personal messages unrelated to business operations, sharing offensive memes, videos, explicit texts, or unwanted romantic propositions via email, WhatsApp, or social media.",
        "Physical: Unwelcome touching, patting, pinching, hugging, cornering, or blocking someone's movement.",
        "Behavioral: Repeated social or romantic invitations extended to a colleague after they have clearly refused, and flirting despite clear objection.",
      ),
    ),

    /* 8 ─────────────────────────────────────────────────────────── */
    heading(
      "Roles & Responsibilities",
      sub("8.1 Employee & Bystander Responsibilities"),
      ul(
        "Comply with all guidelines laid down in this policy.",
        "Refrain from engaging in any behavior that could be interpreted as sexual harassment.",
        "Bystander Responsibility: Employees who witness or become aware of harassment are strongly encouraged and empowered to actively report the incident or offer immediate professional support to the affected individual. Standing by passively undermines workplace safety.",
        "Cooperate fully and truthfully if called upon as a witness during an inquiry proceeding.",
      ),
      sub("8.2 Managerial and Leadership Accountability"),
      p("Managers and team leads hold an elevated duty of care. They are directly accountable for:"),
      ul(
        "Immediate Escalation: Escalating any reported, rumored, or observed incidents to the Human Resources department immediately without running independent parallel investigations.",
        "Maintaining Confidentiality: Ensuring zero leakage of names or details within the team ecosystem.",
        "Preventing Retaliation: Proactively monitoring the workplace to ensure no subtle or overt retaliation occurs against a complainant or witness.",
        "Culture Upkeep: Cultivating a workplace culture completely free of intimidation, clear of crossed boundaries, and deeply rooted in respect.",
      ),
      sub("8.3 Third-Party (Client, Vendor, & Visitor) Responsibilities"),
      p(
        "All external stakeholders—including vendors, associates, clients, contractors, and visitors—must strictly comply with this POSH policy while on firm premises, participating in Enterprise events, or communicating with {firm} personnel through digital channels. Non-compliance will result in immediate termination of business associations, removal from premises, and legal action if warranted.",
      ),
      sub("8.4 Firm Responsibilities"),
      ul(
        "Provide a safe working environment at the workplace.",
        "Display the order constituting the authority prominently at the workplace and digitally.",
        "Organize periodic workshops and awareness programs for employees.",
        "Provide necessary facilities to the authority for dealing with complaints and conducting inquiries.",
      ),
    ),

    /* 9 ─────────────────────────────────────────────────────────── */
    heading(
      "Internal Complaints Committee (ICC)",
      p(
        "{firm} has constituted an Internal Complaints Committee (ICC) specifically tasked with addressing complaints of sexual harassment.",
      ),
      p("The committee is composed of the following members, nominated by the management:"),
      ul(
        "Founder: Founder of the workplace.",
        "Employee Members: Not less than two members from amongst employees, preferably committed to the cause of women or who have had experience in social work or possess legal knowledge.",
        "External Member: One member from amongst non-governmental organizations or associations committed to the cause of women or a person familiar with the issues relating to sexual harassment.",
      ),
      committee(
        [
          { position: "Founder", name: "Manan Vasa", email: "manan@unleashed.in", contact: "+91 80970 10410" },
          {
            position: "Employee Member (1)",
            name: "Rutvisha Mehta",
            email: "rutvishamehta.altuscorp@gmail.com",
            contact: "+91 99877 41410",
          },
          {
            position: "Employee Member (2)",
            name: "Ruchita Ambre",
            email: "ruchitaambre.altuscorp@gmail.com",
            contact: "+91 91671 10410",
          },
          {
            position: "External Member",
            name: "Neetu Jawale",
            email: "nbjawle@gmail.com",
            contact: "+91 99675 71576",
          },
        ],
        "The exact names and contact details of the current ICC members are updated and displayed.",
      ),
    ),

    /* 10 ────────────────────────────────────────────────────────── */
    heading(
      "Complaint & Redressal Work Flow Diagram",
      p("End-to-end process from incident to case closure."),
      workflow(
        [
          {
            text: "Incident Occurs — An incident of sexual harassment takes place within the scope of the workplace, as defined under this policy.",
            note: "Trigger Event",
          },
          {
            text: "Complaint Submission — Written complaint submitted to the ICC or hr@altuscorp.in within seven (7) days of the incident.",
            note: "Within 7 Days",
          },
          {
            text: "Acknowledgment — Notice sent to the Respondent within 7 working days; response required within 10 working days.",
            note: "7 + 10 Working Days",
          },
          {
            text: "Inquiry Process — Fair hearings, evidence evaluation, and witness interviews are conducted, to be completed within a maximum of 30 days.",
            note: "Max 30 Days",
          },
          {
            text: "Recommendation — The ICC issues formal findings and recommends appropriate penalties to Management.",
            note: "ICC Findings",
          },
          {
            text: "Management Action — Disciplinary action or penalties are executed within statutory timelines.",
            note: "Statutory Limit",
          },
        ],
        "Case Closure — Implementation verification, documentation filing, and final closure of the case.",
      ),
    ),

    /* 11 ────────────────────────────────────────────────────────── */
    heading(
      "Detailed Inquiry And Redressal Procedure",
      sub("11.1 Submitting a Complaint"),
      p(
        "An aggrieved individual can submit a formal complaint directly to the ICC or via the dedicated HR email channel: hr.altuscorp@gmail.com.",
      ),
      ul(
        "Format: The complaint must be submitted in writing, detailing dates, times, location, description of the incident(s), names of the respondent, and names of any witnesses. If the individual cannot write it down, the ICC will provide reasonable assistance to draft it.",
        "Timeline: The complaint must be filed within (7) Days from the date of the incident (or the last incident in a series). The ICC may extend this by another three months if valid reasons for the delay are provided in writing.",
      ),
      sub("11.2 Conciliation"),
      p(
        "Before initiating a formal inquiry, the ICC may, at the written request of the aggrieved individual, take steps to settle the matter between the parties through conciliation. No monetary settlement shall be made as a basis of conciliation. If a settlement is reached, it is recorded and forwarded to management for implementation; no further inquiry is conducted.",
      ),
      sub("11.3 Formal Inquiry Process"),
      p("If conciliation is not requested or fails, the formal process initiates:"),
      ul(
        "Notice: Complaint copy forwarded to the respondent within seven (7) working days of receipt.",
        "Response: Respondent must submit their reply, supporting documents, and witness list within ten (10) working days.",
        "Evidence & Hearing: Both parties are given a fair, unbiased opportunity to be heard. Legal practitioners are not permitted to represent either party during the proceedings.",
        "Timeline for Completion: The inquiry must be completed within a period of Thirty (30) days from its commencement.",
      ),
      sub("11.4 Interim Relief"),
      p(
        "During the pendency of an inquiry, upon a written request from the aggrieved individual, the ICC may recommend interim reliefs to the management, which may include transferring either party, granting additional leave up to thirty days to the aggrieved individual, or restricting the respondent from reporting on or evaluating the aggrieved individual's work performance.",
      ),
    ),

    /* 12 ────────────────────────────────────────────────────────── */
    heading(
      "Confidentiality & Enhanced Protection Against Victimization",
      sub("12.1 Absolute Confidentiality"),
      p(
        "The identity of the aggrieved individual, the respondent, witnesses, and any information relating to conciliation or inquiry proceedings are strictly confidential. Under statutory guidelines, this information must not be published, communicated, or made known to the public, press, or media. Any breach will result in immediate disciplinary action.",
      ),
      sub("12.2 Comprehensive Protection Against Victimization"),
      p(
        "{firm} guarantees that no employee will be victimized, penalized, or disciplined for reporting an incident in good faith or for participating as a witness.",
      ),
      p(
        "Retaliation or victimization is strictly prohibited and is expanded to explicitly include the following actions if used as punitive measures against an individual involved in a POSH case:",
      ),
      ul(
        "Deliberately giving poor performance ratings or biased appraisal scores.",
        "Unjustified denial of promotion or career advancement opportunities.",
        "Social isolation, professional exclusion, or intentional marginalization within the team.",
        "Transfer to another department, location, or shift explicitly intended as a punishment.",
        "Arbitrary salary reduction or withholding of earned bonuses.",
        "Overt or covert threats (professional or personal).",
        "Providing unfair negative professional references to external entities.",
      ),
      p(
        "Any form of retaliatory behavior must be reported to HR immediately and will be treated as a severe disciplinary violation.",
      ),
    ),

    /* 13 ────────────────────────────────────────────────────────── */
    heading(
      "False Or Malicious Complaints",
      p(
        "If the ICC concludes, after a thorough inquiry, that an allegation was made maliciously, or that false, forged, or misleading evidence was produced, strict disciplinary action will be taken against the individual(s).",
      ),
      p(
        "A mere inability to substantiate a complaint or provide adequate proof does not equate to a false or malicious complaint. Malice must be clearly established through intent and concrete evidence before any counter-action is initiated.",
        "Important Clarification: ",
      ),
    ),

    /* 14 ────────────────────────────────────────────────────────── */
    heading(
      "Disciplinary Actions",
      p(
        "If the allegation against the respondent is proved, the ICC will recommend disciplinary actions to the {firm} management. Actions may include, but are not limited to:",
      ),
      ul(
        "Written warning, censure, or reprimand.",
        "Mandatory counseling sessions.",
        "Withholding of promotion, increments, or performance bonuses.",
        "Suspension from service for a specified period.",
        "Immediate termination of employment without notice.",
        "Deduction from salary/wages of the respondent to compensate the aggrieved individual, as per legal parameters.",
      ),
    ),

    /* 15 ────────────────────────────────────────────────────────── */
    heading(
      "Awareness & Training",
      ul(
        "Onboarding Integration: Inclusion of the POSH policy overview during the induction of every new employee.",
        "Periodic Sensitization Workshops: Regular interactive sessions conducted by experts to educate employees on boundaries, rights, and responsibilities.",
        "Leadership Training: Special briefing sessions for managers, team leads, and members regarding unbiased redressal and their role under the legal framework.",
      ),
    ),

    /* 16 ────────────────────────────────────────────────────────── */
    heading(
      "Policy Review And Amendments",
      p(
        "This policy is subject to updates and revisions to align with evolving legal amendments under Indian law, Enterprise growth, or operational enhancements. Any amendments will be reviewed by the Human Resources Department and must receive formal approval from the Founder before implementation.",
      ),
    ),

    /* 17 ────────────────────────────────────────────────────────── */
    heading(
      "Governing Law & Jurisdiction",
      p("This Policy shall be governed by and construed in accordance with the laws of India."),
      p(
        "Any dispute, claim, interpretation, or legal proceeding arising out of or relating to this Policy shall be subject to the exclusive jurisdiction of the competent courts situated in Mumbai, Maharashtra, India",
      ),
    ),
  ],

  /* 18 — Employee Declaration & Acknowledgment (verbatim text) ───── */
  declaration: declaration({
    heading: "Employee Declaration & Acknowledgment",
    statement:
      "Please read the statement below carefully. Sign, date, and return this page to the Human Resources Department within seven (7) days of receiving this document. I, the undersigned, hereby acknowledge that I have received, read, and fully understood the {firm} Prevention of Sexual Harassment (POSH) Policy (Version 1.0). I agree to abide by the principles, conduct guidelines, relationship boundaries, and rules outlined in this policy. I understand that any violation of this policy may lead to disciplinary action up to and including the termination of my employment with {firm}.",
  }),
};

export default poshPolicy;
