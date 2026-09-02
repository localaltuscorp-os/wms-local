/**
 * HR LETTER — Undertaking for Internship Participation by a Minor (Parental
 * Consent). Recruitment & Interns family.
 *
 * Unlike the outbound Altus letters, this document is authored FROM the
 * parent/legal guardian TO Altus Corp: it opens with a "To, Altus Corp" address
 * block + subject, captures the minor intern's details (Section 1), each
 * parent/guardian's details (Sections 2 & 3), the eleven Undertaking &
 * Declaration clauses 4.1–4.11 (frozen prose, transcribed verbatim), the
 * Section 5 declaration, and closes with four physical sign lines
 * (Parent/Guardian · Intern · HR Representative · Date & Official Stamp).
 *
 * Every RED value in the source is an f() editable field; every clause /
 * heading / declaration is FROZEN prose that reads the same on every issue. The
 * intern's age is captured once in Section 1 and REUSED (same field id
 * `internAge`) inside clause 4.2 so the two stay in sync. Signed physically by
 * the parent — no digital e-sign (signature: "none").
 *
 * PURE + CLIENT-SAFE — imports only ../types (no db / node / server-only).
 * Load-neutral.
 */

import { type LetterTemplate, t, f, para, heading, term, spacer } from "../types";

const template: LetterTemplate = {
  key: "minor-internship-undertaking",
  title: "Undertaking — Minor Intern (Parental Consent)",
  category: "recruitment",
  entityDefault: "altus-corp",
  signature: "none",
  blurb:
    "Parental-consent undertaking for a minor (below 18) participating in an internship at Altus Corp.",
  blocks: [
    // ── To / address block (recipient = Altus Corp) ─────────────────────
    para(t("To,")),
    para(t("Manan Vasa,")),
    para(t("{firm},")),
    para(t("C-6, Gambhir Estates,")),
    para(t("Kotkar Road, Off Aarey Road,")),
    para(t("Goregaon East – 400063,")),
    para(t("Email: manan@unleashed.in")),
    para(t("Date: "), f("letterDate", "Date", { placeholder: "04/01/2026", date: true })),
    spacer("sm"),

    // ── Subject ─────────────────────────────────────────────────────────
    para(t("Subject: Undertaking for Internship Participation by our minor son/ daughter")),
    spacer("sm"),

    // ── Greeting + preamble ─────────────────────────────────────────────
    para(t("Dear Manan Vasa,")),
    para(
      t(
        "I, the undersigned, hereby submit this Undertaking in connection with the internship of my ward / child at {firm}. I acknowledge and agree to the following terms and conditions, which govern the participation of a minor (below the age of 18 years) in an internship programme at the organisation.",
      ),
    ),

    // ── 1. Details of the Intern ────────────────────────────────────────
    heading("1. DETAILS OF THE INTERN", 2),
    term("Full Name of Intern", f("internName", "Full Name of Intern", { placeholder: "Full name" })),
    term("Date of Birth", [
      f("internDob", "Date of Birth", { placeholder: "DD/MM/YYYY", date: true }),
      t("     Age as on Date: "),
      f("internAge", "Age as on Date", { placeholder: "e.g. 16" }),
    ]),
    term("Current Class / School", f("internClassSchool", "Current Class / School", { placeholder: "e.g. Class XI, ABC School" })),
    term("Internship Duration", [
      t("From "),
      f("durationFrom", "From", { placeholder: "DD/MM/YYYY", date: true }),
      t("   To "),
      f("durationTo", "To", { placeholder: "DD/MM/YYYY", date: true }),
    ]),
    term("Emergency Contact", f("emergencyContact", "Emergency Contact", { placeholder: "Name & phone number" })),
    term("Mode of Internship", f("modeOfInternship", "Mode of Internship", { defaultValue: "In-Person" })),

    // ── 2. Details of Parent 1 / Guardian 1 ─────────────────────────────
    heading("2. DETAILS OF PARENT 1/ GUARDIAN 1", 2),
    term("Full Name", f("parent1Name", "Full Name", { placeholder: "Full name" })),
    term("Relationship with Intern", f("parent1Relationship", "Relationship with Intern", { placeholder: "e.g. Father / Mother / Guardian" })),
    term("Contact Number", f("parent1Contact", "Contact Number", { placeholder: "Phone number" })),
    term("Email Address", f("parent1Email", "Email Address", { placeholder: "name@example.com" })),
    term("Address", f("parent1Address", "Address", { placeholder: "Residential address", multiline: true })),

    // ── 3. Details of Parent 1 / Guardian 1 ─────────────────────────────
    heading("3. DETAILS OF PARENT 1/ GUARDIAN 1", 2),
    term("Full Name", f("parent2Name", "Full Name", { placeholder: "Full name" })),
    term("Relationship with Intern", f("parent2Relationship", "Relationship with Intern", { placeholder: "e.g. Father / Mother / Guardian" })),
    term("Contact Number", f("parent2Contact", "Contact Number", { placeholder: "Phone number" })),
    term("Email Address", f("parent2Email", "Email Address", { placeholder: "name@example.com" })),
    term("Address", f("parent2Address", "Address", { placeholder: "Residential address", multiline: true })),

    // ── 4. Undertaking and Declarations ─────────────────────────────────
    heading("4. UNDERTAKING AND DECLARATIONS", 2),
    para(
      t(
        "I, as the parent/legal guardian of the above-named minor intern, hereby solemnly undertake and declare as follows:",
      ),
    ),
    para(
      t(
        "4.1  Consent for Participation:  I grant full and informed consent for my ward to participate in the internship programme offered by {firm} for the duration specified above.",
      ),
    ),
    para(
      t("4.2  Acknowledgement of Age:  I confirm that my ward is "),
      f("internAge", "Age as on Date"),
      t(
        " years of age and does not meet the statutory employment age requirement. I understand that this internship is strictly for learning and developmental purposes and does not constitute employment or any contractual obligation of a labour nature.",
      ),
    ),
    para(
      t(
        "4.3  Compliance with Laws:  I acknowledge that this arrangement shall be governed by the applicable provisions of by the Child Labour (Prohibition and Regulation) Act, 1986 and all other applicable laws concerning minors. The internship shall not involve any hazardous, manual, or prohibited work.",
      ),
    ),
    para(
      t(
        "4.4  Working Hours:  I confirm that my ward's internship hours will be 10:30 am to 7:30 pm (Monday to Friday) and shall not interfere with school hours, academic commitments, or rest time. Weekend or holiday work shall require my prior express consent.",
      ),
    ),
    para(
      t(
        "4.5  Supervision:  I acknowledge that my ward shall be supervised at all times by a designated mentor at {firm} and that I shall be reachable during all internship hours for any emergency or communication.",
      ),
    ),
    para(
      t(
        "4.6  Conduct and Discipline:  I undertake that my ward shall adhere to the code of conduct, confidentiality requirements, and professional standards of {firm} for the duration of the internship. Any breach of conduct may result in immediate termination of the internship.",
      ),
    ),
    para(
      t(
        "4.7  Confidentiality:  I and my ward agree to maintain strict confidentiality with respect to any proprietary, sensitive, or internal information of {firm} that may come to our knowledge during the internship, both during and after the internship period.",
      ),
    ),
    para(
      t(
        "4.8  Health & Safety:  I confirm that my ward is medically fit to participate in the internship and shall inform {firm} of any health conditions or special requirements. {firm} shall not be held responsible for any pre-existing conditions.",
      ),
    ),
    para(
      t(
        "4.9  Insurance & Liability:  I acknowledge that {firm} shall not be liable for any injury, illness, accident, or loss suffered by my ward during the internship period, unless arising from gross negligence on the part of the organisation. I agree to arrange appropriate personal insurance coverage for my ward.",
      ),
    ),
    para(
      t(
        "4.10  Withdrawal & Termination:  I understand that either party may withdraw from this internship arrangement with prior written notice of at least 3 (three) business days. {firm} reserves the right to terminate the internship immediately in the event of misconduct or breach of any undertaking herein.",
      ),
    ),
    para(
      t(
        "4.11  Remuneration:  I understand and agree that this internship is stipendiary of Rs 5000/- (as applicable), and does not entitle my ward to any full-time employment with {firm} now or in the future.",
      ),
    ),

    // ── 5. Declaration ──────────────────────────────────────────────────
    heading("5. DECLARATION", 2),
    para(
      t(
        "I declare that the information provided above is true, complete, and accurate to the best of my knowledge. I have read and understood this Undertaking in its entirety and agree to be bound by the terms herein. I understand that this document shall be retained on record by {firm}.",
      ),
    ),
    para(
      t(
        "In witness whereof, I have signed this Undertaking on the date first mentioned above.",
      ),
    ),

    // ── Signature lines ─────────────────────────────────────────────────
    spacer("lg"),
    para(t("_______________________________")),
    para(t("Signature of Parent / Guardian")),
    spacer("md"),
    para(t("_______________________________")),
    para(t("Signature of Intern")),
    spacer("md"),
    para(t("_______________________________")),
    para(t("Signature of HR Representative, {firm}")),
    spacer("md"),
    para(t("_______________________________")),
    para(t("Date & Official Stamp")),
  ],
};

export default template;
