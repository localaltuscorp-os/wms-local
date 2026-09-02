/**
 * Anti-Harassment & Non-Discrimination Policy — Altus Corp.
 *
 * Authored as a declarative `PolicyDoc` (see lib/hr/policies/types.ts). This is
 * FROZEN legal text transcribed verbatim from the source policy document; the
 * only live variable is the paying `entityDefault` (reader can re-brand the
 * letterhead). PURE + CLIENT-SAFE — no db / node / server-only imports.
 *
 * Registration: exported as the default; the Assemble phase adds it to POLICIES
 * in lib/hr/policies/registry.ts under key "anti-harassment-non-discrimination-policy".
 *
 * NOTE ON SECTION NUMBERING: the source document is numbered 2–10 (its own
 * Section 1 sits on a leaf not supplied). The renderer auto-numbers sections
 * from 1, and the frozen text contains verbatim internal cross-references
 * ("standards set out in Section 4.3", "Section 4.2"). To keep those references
 * accurate, this file opens with a Section 1 preamble so that "Policy Statement
 * & Scope" renders as Section 2, matching the source numbering exactly.
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

const antiHarassmentPolicy: PolicyDoc = {
  key: "anti-harassment-non-discrimination-policy",
  title: "Anti-Harassment & Non-Discrimination Policy",
  docCode: "HR-POL-003",
  effectiveDate: "01 June 2026",
  version: "1.0",
  owner: "Human Resources Department / Founder",
  registeredOffice:
    "C-6, Ground Floor, Gambhir Estates, Sacred Space (Synergy Road), Kotkar Road, Off Aarey Road, Next to Pravasi Industrial Estate, Hanuman Tekdi, Goregaon East, Mumbai – 400063, Maharashtra, India",
  hrEmail: "hr.altuscorp@gmail.com",
  entityDefault: "altus-corp",
  summary:
    "{firm} is committed to a professional, inclusive and respectful working environment in which every individual is treated with dignity and evaluated solely on merit, capability and execution. This Policy sets out the standards of conduct, the prohibited behaviours, the reporting channels and the disciplinary framework that together protect the organisation's people and culture.",

  sections: [
    /* ── 1. Preamble & Objective ──────────────────────────────────
       Bridging section so the source's Section 2 renders as Section 2 and
       the internal "Section 4.3 / 4.2" cross-references stay accurate. */
    heading(
      "Preamble & Objective",
      p(
        "This Anti-Harassment & Non-Discrimination Policy establishes {firm}'s uncompromising commitment to a workplace free from discrimination, harassment, microaggression and bullying in any form. It has been adopted by the Founder and the Human Resources Department and forms an integral part of the terms of engagement of every individual to whom it applies.",
      ),
      p(
        "The objective of this Policy is to define prohibited conduct, empower every member of the organisation to report concerns safely, guarantee objective and confidential redressal, and set out the disciplinary consequences of any breach — thereby safeguarding employee dignity, sustaining an inclusive corporate culture and preserving the Firm's professional reputation.",
      ),
    ),

    /* ── 2. Policy Statement & Scope ─────────────────────────────── */
    heading(
      "Policy Statement & Scope",
      sub("2.1 Policy Statement"),
      p(
        "{firm} strictly prohibits any manifestation of discriminatory bias, microaggressions, marginalization, or workplace bullying. Any violation of this core behavioral code is categorized as severe professional misconduct and will result in immediate, severe disciplinary consequences up to summary dismissal for cause.",
      ),
      sub("2.2 Scope and Jurisdiction"),
      p("This framework applies universally across the entire operational grid of {firm}:"),
      ul(
        "Personnel Coverage: All core employees, contractual specialists, freelance personnel, temporary resources, advisors, interns, as well as external interview candidates, enterprise clients, delivery staff, and vendor entities.",
        "Physical Workplaces: All physical offices, satellite places, co-working allocations, client deployment facilities, and event venues.",
        "Digital & Remote Infrastructure: All collaboration layers including email, Google Meet, Phone calls, {firm} Apps, Zoom, Microsoft Teams, institutional WhatsApp clusters, virtual conference channels, and public digital platforms where corporate association is legible.",
      ),
    ),

    /* ── 3. Core Guiding Principles ──────────────────────────────── */
    heading(
      "Core Guiding Principles",
      p(
        "The management of workplace grievances and cultural protection at {firm} is governed by five structural principles:",
      ),
      table({
        variant: "principle",
        columns: ["Principle", "Operational Focus"],
        rows: [
          [
            "Uncompromising Meritocracy",
            "Hiring, professional growth, compensation matrix mapping, and performance appraisals are driven purely by skill, execution metrics, and capability.",
          ],
          [
            "Strict Behavioral Rectitude",
            "Every form of corporate microaggression, targeted isolation, profiling, or psychological bullying is systematically identified and intercepted.",
          ],
          [
            "Protected Confidentiality",
            "Grievance logging, witness statements, and committee analysis notes are heavily compartmentalized and accessible only to active investigators.",
          ],
          [
            "Objective Natural Justice",
            "Both the aggrieved individual and the respondent are granted fully neutral, data-driven, and objective representation during any committee assessment.",
          ],
          [
            "Guaranteed Safety Net",
            "Absolute institutional enforcement against any direct or indirect professional retaliation toward a reporting party or an active witness.",
          ],
        ],
      }),
    ),

    /* ── 4. Defining Prohibited Discriminatory Actions & Bullying ── */
    heading(
      "Defining Prohibited Discriminatory Actions & Bullying",
      sub("4.1 Prohibited Discrimination Parameters"),
      p(
        "Discrimination represents any unfair distinction, professional limitation, or exclusion applied to an individual based on personal characteristics rather than functional competence. {firm} provides blanket protections against bias centered around: race, caste, nationality, regional accent, age, biological sex, gender expression, gender identity, sexual orientation, disability, neurodivergence parameters, pregnancy, medical history, religion, political opinion (where lawful), marital status, family status, veteran status, genetic information, socio-economic background, language, or citizenship status (where applicable).",
      ),
      sub("4.2 Workplace Bullying & Hostile Environment Examples"),
      p(
        "Workplace bullying represents a structured pattern of malicious, unreasonable behavior that degrades, minimizes, or psychologically undermines a professional. Key prohibited behavioral archetypes include:",
      ),
      ul(
        "Verbal Aggression: Using slurs, derogatory nicknames, identity-based profiling jokes, mocking physical or neural traits, or utilizing public yelling as a management device.",
        "Virtual & Media Hostility: Distributing demeaning graphics, memes, or text strings targeting specific communities, creeds, or personal traits over digital collaboration infrastructure.",
        "Physical Intimidation: Aggressive structural gestures, deliberate invasion of physical space, intimidation tactics, or threatening postures.",
        "Institutional / Structural Manipulation: Deliberately withholding essential technical briefs to engineering or operation teams to trigger project failure, enforcing completely fabricated deadlines, malicious public performance execution, or engineering systematic peer isolation.",
      ),
      sub("4.3 Abusive, Offensive & Inappropriate Language"),
      p(
        "{firm} maintains a zero-tolerance standard against the use of abusive, offensive, vulgar, insulting, threatening, or intimidating language, as well as profanity, derogatory remarks, disrespectful communication, or discriminatory comments, in any work-related interaction. This standard applies uniformly across every channel of official communication, including:",
      ),
      ul(
        "In-Person & Verbal Communication: Face-to-face conversations, telephone calls, video meetings, and online meetings conducted in a professional capacity.",
        "Digital & Messaging Platforms: Emails, WhatsApp, Zoom Calls, Phone Calls, Microsoft Teams, Google Meet, and other internal messaging or collaboration platforms.",
        "Client & Vendor Interactions: Client meetings, vendor interactions, and all other official, work-related communication undertaken on behalf of {firm}.",
      ),
      p(
        "This standard is enforced to maintain professionalism, promote mutual respect, sustain an inclusive workplace culture, safeguard employee safety, and preserve the Firm's professional reputation.",
      ),
      sub("4.4 Progressive Disciplinary Action for Language Violations"),
      p(
        "Violations of the standards set out in Section 4.3 shall ordinarily be addressed through the following three-warning framework:",
      ),
      ul(
        "First Warning: A verbal warning is issued to the concerned individual, with the details formally documented by Human Resources.",
        "Second Warning: A written warning is issued, accompanied by clearly defined corrective expectations and a timeline for demonstrated improvement.",
        "Third Warning: Final disciplinary action is taken, which may include suspension, termination of employment, or any other disciplinary action deemed appropriate by Management, having regard to the severity and frequency of the misconduct.",
      ),
      p(
        "Notwithstanding the foregoing, instances of severe misconduct, abusive behaviour, threats, harassment, discriminatory remarks, or any other serious violation of this Policy may result in immediate disciplinary action, including termination of employment, without following the sequential warning process set out above, where Management determines such action to be justified.",
      ),
    ),

    /* ── 5. Operational Accountability & Roles ───────────────────── */
    heading(
      "Operational Accountability & Roles",
      sub("5.1 Individual & Bystander Duties"),
      p(
        "Every member of the organization must actively preserve a respectful, professional ecosystem. Bystanders are explicitly empowered and culturally expected to stand up against witnessed bullying or to directly file a confidential notification with the HR department to ensure corporate safety balances are maintained.",
      ),
      sub("5.2 Leadership & Management Mandate"),
      p(
        "Managers and leadership stakeholders are structural guardians of this framework. They must immediately escalate any verbalized or observed instance of bullying, structural bias, or profiling to HR within 24 hours. Managers are restricted from running self-styled parallel resolutions, as all tracking must follow standardized compliance pathways.",
      ),
    ),

    /* ── 6. Grievance Redressal Framework ────────────────────────── */
    heading(
      "Grievance Redressal Framework",
      p(
        "To execute objective reviews, {firm} has operationalized a centralized compliance committee. This structural panel evaluates all reported incidents with maximum confidentiality and operational rigor:",
      ),
      committee([
        {
          position: "Founder",
          name: "Manan Vasa",
          email: "manan@unleashed.in",
          contact: "+91 80970 10410",
        },
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
      ]),
    ),

    /* ── 7. Step-by-Step Reporting & Inquiry Lifecycle ───────────── */
    heading(
      "Step-by-Step Reporting & Inquiry Lifecycle",
      p(
        "All reports are managed via a streamlined timeline to ensure prompt resolution without bureaucratic drag:",
      ),
      workflow([
        {
          text: "Logging Phase: An affected professional submits a written grievance outline to the committee via hr.altuscorp@gmail.com within 1 week of the specific incident occurrence.",
          note: "Within 1 week of the incident",
        },
        {
          text: "Structural Verification: The committee acknowledges receipt within forty-eight (48) hours and issues a notice matrix to the respondent within seven (7) working days.",
          note: "Acknowledgement within 48 hours; notice within 7 working days",
        },
        {
          text: "Impartial Fact-Finding: The panel analyzes chat databases, evaluates operational code logs, and reviews witness statements. The entire inquiry lifecycle must be executed within a clear Fifteen (15) day ceiling.",
          note: "Inquiry completed within a 15-day ceiling",
        },
        {
          text: "Interim Protection: During active reviews, the committee can execute immediate protective adjustments—such as separating reporting relationships, altering Teams configurations, shifting team sprints, or placing the respondent on paid administrative leaves.",
        },
        {
          text: "Good Faith & False Complaints: Complaints raised honestly and in good faith shall not result in disciplinary action against the complainant merely because the allegation could not ultimately be substantiated. However, complaints that are knowingly malicious or intentionally false, made in bad faith to cause harm to another individual, may themselves result in disciplinary action. This clause shall not be construed to discourage genuine reporting of workplace concerns.",
        },
      ]),
    ),

    /* ── 8. Safeguards Against Retaliation & Disciplinary Framework ── */
    heading(
      "Safeguards Against Retaliation & Disciplinary Framework",
      sub("8.1 Absolute Non-Retaliation Guarantee"),
      p(
        "{firm} maintains an uncompromising stance against career victimization. Any subtle or explicit retaliation—such as giving fabricated low appraisal metrics, withholding standard equity options, malicious shifts in team dynamics, or digital exclusion due to a filed grievance—is a direct critical policy breach.",
      ),
      sub("8.2 Actionable Disciplinary Matrix"),
      p(
        "Upon conclusive confirmation of a policy violation, the committee will recommend disciplinary actions proportional to the gravity of the infraction:",
      ),
      ul(
        "Warning Matrix: Formal warning document logged permanently into the professional's compliance ledger.",
        "Remedial Requirements: Mandatory structured coaching programs and specific neuro-inclusive behavioral training.",
        "Financial Punitive Actions: Freezing of performance-linked increments, variable payouts, or immediate promotion cancellations.",
        "Separation Pathway: Immediate summary separation and termination of employment contract for cause, with zero severance.",
      ),
    ),

    /* ── 9. Governing Law & Jurisdiction ─────────────────────────── */
    heading(
      "Governing Law & Jurisdiction",
      p("This Policy shall be governed by and construed in accordance with the laws of India."),
      p(
        "Any dispute, claim, interpretation, or legal proceeding arising out of or relating to this Policy shall be subject to the exclusive jurisdiction of the competent courts situated in Mumbai, Maharashtra, India.",
      ),
    ),

    /* ── 10. Employee Declaration & Corporate Sign-Off ───────────── */
    heading(
      "Employee Declaration & Corporate Sign-Off",
      p(
        "Please read the declaration statement below thoroughly. Authenticate, date, and return this sheet to People Operations within seven (7) business days.",
      ),
      p(
        "I, the undersigned, hereby acknowledge that I have received, read, and comprehensively understood the {firm} Anti-Harassment & Non-Discrimination Policy (Version 1.0).",
      ),
      p(
        "I explicitly agree to preserve the professional codes, interactive boundaries, and behavioral expectations defined herein. I understand that failure to operate within this respectful corporate ecosystem will result in immediate disciplinary measures up to summary termination of my association with {firm}.",
      ),
    ),
  ],

  declaration: declaration(),
};

export default antiHarassmentPolicy;
