/**
 * LETTER — Letter of Appointment (the full formal 19-clause employment contract).
 *
 * Transcribed VERBATIM from the Altus Corp 6-page "Letter of Appointment". Every
 * clause below is FROZEN prose; the red editable fields (f(...)) are only the
 * per-candidate particulars: recipient, address, role, dates, probation term,
 * job description, compensation figures, notice period, working hours and the
 * signing date/place. Reused field ids (recipientName, date, place) stay in sync
 * across the greeting, body and the two-column sign-off.
 *
 * PURE + CLIENT-SAFE — authored against ./types only. No server/db imports.
 */

import { type LetterTemplate, t, f, para, heading, bullets, term, signature } from "../types";

const template: LetterTemplate = {
  key: "appointment",
  title: "Appointment Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "The full formal Letter of Appointment — 19 numbered clauses, the complete employment contract.",
  blocks: [
    /* ── Addressee block ─────────────────────────────────────────── */
    para(t("To,")),
    para(f("recipientName", "Recipient Name", { placeholder: "e.g. Ms. Rutvisha A Mehta" })),
    para(
      f("addressBlock", "Address", {
        placeholder: "1/61 Varma Nagar, Old Nagardas Road, Andheri East, Mumbai 400069",
        multiline: true,
      }),
    ),

    term("Subject", [
      f("subject", "Subject Line", { defaultValue: "Letter of Appointment", bold: true }),
    ]),

    para(t("Dear "), f("recipientName", "Recipient Name"), t(",")),

    para(
      t("We are pleased to inform you that you are hereby appointed as "),
      f("designation", "Designation", { placeholder: "e.g. Operations Consultant" }),
      t(" at {firm} – Mumbai office, as per the terms and conditions discussed and agreed upon as under:"),
    ),

    heading("Terms and Conditions", 2),

    /* ── 1. Appointment ──────────────────────────────────────────── */
    heading("1. Appointment", 3),
    para(
      t("This appointment is effective from "),
      f("effectiveDate", "Effective Date", { placeholder: "e.g. 15 March 2026", date: true }),
      t("."),
    ),

    /* ── 2. Posting ──────────────────────────────────────────────── */
    heading("2. Posting", 3),
    bullets(
      [
        t(
          "a. That your duty hours, place of work and your transfer from one department to another or from one Firm to other associated Firm, one area to another area or one state to another state will be within the management's discretion and you will abide with all such decisions without any hesitation or without any extra demand of remuneration.",
        ),
      ],
      [
        t(
          "b. Your place of work, in the first instant, will be Mumbai. However, you will be required to travel for duty anywhere in India, depending on the needs of the organization. You will be asked beforehand and your consent will be taken before committing to the client.",
        ),
      ],
    ),

    /* ── 3. Joining Formalities ──────────────────────────────────── */
    heading("3. Joining Formalities", 3),
    para(t("All new employees including trainees are expected to carry the following documents on the day of joining:")),
    bullets(
      [t("a. Originals and photocopies of your qualifications,")],
      [t("b. Date of birth proof")],
      [t("c. Address proof")],
      [t("d. 2 passport size photographs")],
      [
        t(
          "e. Experience Certificates or Clearance Letter (If a situation requires certain provisions can be by-passed. Concerned officer or manager will write a remark mentioning why the process was by-passed)",
        ),
      ],
      [
        t(
          "f. Proof of last drawn salary for 3 consecutive months, (1) Bank statement for last 3 months and (2) Latest salary slip from the previous employer or a direct mail from the previous employer to the designated person at {firm}, as will be informed at the time of joining.",
        ),
      ],
      [t("g. Relieving Letter")],
    ),

    /* ── 4. Probation ────────────────────────────────────────────── */
    heading("4. Probation", 3),
    bullets(
      [
        t("a. You will be on probation for a period of "),
        f("probationMonths", "Probation Period", { defaultValue: "6 (Six months)" }),
        t(
          ", from your date of joining, after which your performance will be appraised. You will be confirmed in your appointment in writing on successful completion of the said probationary period. In case no confirmation is made in writing at the end of the probationary period, it will be deemed to have extended until the Firm confirms in writing otherwise.",
        ),
      ],
      [
        t(
          "b. During the probation period, we may terminate your position immediately (usually in 3 working days) and you may terminate this Agreement by giving ",
        ),
        f("terminationNotice", "Probation Notice", { defaultValue: "15 days" }),
        t(" notice in writing."),
      ],
    ),

    /* ── 5. Broad Job Description ────────────────────────────────── */
    heading("5. Broad Job Description", 3),
    para(
      f("jobDescription", "Broad Job Description", {
        placeholder:
          "Get participants to complete their tools (our proprietary formats created on Google Drive - training will be given - but common sense and practice is required on part of the Candidate)…",
        multiline: true,
      }),
    ),

    /* ── 6. Compensation & Benefits ──────────────────────────────── */
    heading("6. Compensation & Benefits", 3),
    bullets(
      [t("a. Your detailed Salary Break-up is available in the Cost to Firm Break-up annexed.")],
      [
        t("b. You will receive a fixed compensation of "),
        f("compProbation", "Compensation (Probation)", { placeholder: "e.g. Rs. 30,000/- per month" }),
        t(" during your probationary period and "),
        f("compConfirmed", "Compensation (Confirmed)", { placeholder: "e.g. 30,000/- per month" }),
        t(
          " after completion of the probationary period. This will be the total cost per month to the Firm. The payment of your compensation shall be subject to such statutory and/or income tax deductions at source as may be required in accordance with the applicable legislation in force from time to time.",
        ),
      ],
      [
        t(
          "c. {firm} will have a right to restructure your total compensation package into various components without adversely affecting the total compensation payable to you under this letter of appointment.",
        ),
      ],
      [
        t(
          "d. Salary will be paid to you on or before the 10th of every month by cheque or through internet banking only.",
        ),
      ],
      [t("e. We do not have a bonus policy.")],
      [
        t(
          "f. Your future increments or promotion or any other salary increase shall be based on performance incentives earned, merit, considering your periodic and consistent overall performance, your willingness and ability to take more challenges, your own appetite for growth, business conditions and other parameters fixed from time to time at the discretion of the management and shall not be considered merely as a matter of your right.",
        ),
      ],
      [
        t(
          "g. If you decide on yourself to leave the Firm without serving notice period then the Firm is not liable to pay your current month salary.",
        ),
      ],
      [t("h. No show at work without intimation will also result in nonpayment of dues.")],
      [
        t(
          "i. Salary per day shall be calculated on the basis of no of days in that month, ie 28, 29, 30 or 31 days.",
        ),
      ],
    ),

    /* ── 7. Expense Reimbursement Policy ─────────────────────────── */
    heading("7. Expense Reimbursement Policy", 3),
    para(
      t(
        "You will not be reimbursed for any out of pocket expenses that you incur for traveling from your residence to office. Conveyance & Travel Expenses will be paid for your travel to client places from time to time if you get involved in field work.",
      ),
    ),

    /* ── 8. Notice Period ────────────────────────────────────────── */
    heading("8. Notice Period", 3),
    para(
      t(
        "Either party, by stating their intention to do so, in writing may terminate this employment at any time, provided that at least 1 month notice is given in case of a Non Managerial Position and 2 month notice in case of a Managerial Position. If for any reason, you decide to be a No show at work during your probation or after confirmation of your employment, the Firm shall not be liable to compensate you for the no of days from the last day of the previous Calendar month. Further, if you decide to quit without completing the notice period, the Firm shall not be liable to compensate you for the no of days from the last day of the previous Calendar month.",
      ),
    ),

    /* ── 9. Working Hours ────────────────────────────────────────── */
    heading("9. Working Hours", 3),
    para(
      t("You are expected to adhere to the office timing which is "),
      f("workingHours", "Working Hours", { defaultValue: "10:30 AM to 7:30 PM" }),
      t(
        ". If you wish to take a break or go out of the office for personal work, you will do so with the prior approval of your respective manager. Lunch time shall be limited to 30 minutes. Excessive breaks will be regarded as half day and disciplinary action may be taken.",
      ),
    ),
    para(
      t(
        "You may be required to work beyond standard office hours on a few days to complete any balance work given to you or to meet any deadline set by the management. Such times will not be eligible for any kind of compensation against hours where you may have worked less.",
      ),
    ),
    para(
      t(
        "During the days when we have our workshop or a sales event, you will be required to come early or stay late.",
      ),
    ),
    para(
      t(
        "You will be marked as Checked In Late if you enter the office or Client's place beyond 15 minutes of your reporting time. You will also be marked as Checked Out Early if you leave earlier than closing time from the office or from the client's place. 3 or more late marks in a calendar month would be treated as absent for the day. Reporting at the office or at the client's place post 11 AM shall be treated as half day as well. Accordingly, your salary compensation shall be reduced. Please read the updated Attendance Policy of the Firm on the First Day of your Joining.",
      ),
    ),
    para(
      t(
        "The Firm exclusively reserves the right to give you any exception to the above mentioned rules regarding working hours. Given the stage and nature of our work, all employees have different timings. If any exception is given to you, it will not be considered as your right in any way. The Firm may choose to have different rules regarding working hours for different employees. You will not be allowed to challenge the decision of the management under any circumstances.",
      ),
    ),

    /* ── 10. Leave Policy ────────────────────────────────────────── */
    heading("10. Leave Policy", 3),
    para(
      t(
        "After your Probation is complete, the Firm offers 7 paid leaves that you can utilize anytime during the year out of which 3 leaves you can be utilised in the first 6 months and remaining 4 leaves can be utilised in the next 6 months.",
      ),
    ),
    para(
      t(
        "If we are working on a Sunday or a Public Holiday, you can avail a compensatory off in the following week. In such a case, you will be given a full day compensatory leave in the following week. If you do not take compensatory leave, you will be paid an extra day of salary. Employees in Probation period, do not have the privilege of the 7 leaves. Any additional leaves beyond 7 days in a year shall be considered as Leave Without Pay and they shall be adjusted from your salary.",
      ),
    ),
    para(
      t(
        "For availing any leave longer than 2 days, prior notice of 7 days shall be sent to your manager in writing for approval. The Firm exclusively reserves the right to give you any exception to the above mentioned rules regarding leave policy. Given the stage, nature of our work and religious faith of different employees, all employees will be given leaves on different days. If any exception is given to you, it will not be considered as your right in any way. The Firm may choose to have different rules regarding granting leaves to different employees. You will not be allowed to challenge the decision of the management under any circumstances.",
      ),
    ),

    /* ── 11. Dress Code ──────────────────────────────────────────── */
    heading("11. Dress Code", 3),
    term("Men", [t("Formal Trousers, Shirt & Formal Shoes & hair neatly groomed")]),
    term("Women", [
      t("Formal Wear/ Traditional attire covering knee and covered shoulders at all times & hair neatly groomed"),
    ]),
    para(
      t(
        "During Monsoons, you can keep a pair of formal shoes and change of clothes in the office. Management reserves the right to direct you to dress or present yourself in an appropriate standard as a condition of your employment.",
      ),
    ),

    /* ── 12. Termination ─────────────────────────────────────────── */
    heading("12. Termination", 3),
    para(t("Your services will stand terminated on the following grounds:")),
    bullets(
      [
        t(
          "a. In the event of your being guilty of misconduct or inattention or negligence in the discharge of your duties in the conduct of the Firm's business, or such misdemeanor which is likely to affect, or affects the reputation of the Firm's working or of any breach of terms and conditions herein, the Firm reserves its rights to terminate your services at any given point of time, with immediate effect, without any compensation or notice.",
        ),
      ],
      [
        t(
          "b. If you are found to not possess the desired competence, skills, willingness, qualification or experience, which do not conform to the rules and/or requirement of the firm, as may be required from time to time and necessary for the continuation of businesses or its exigencies or on account of redundancy.",
        ),
      ],
    ),

    /* ── 13. Confidentiality ─────────────────────────────────────── */
    heading("13. Confidentiality", 3),
    para(
      t(
        "You will undertake, that while in the employment of the Firm, and for a period of 36 months after separation from the Firm, for any reason whatsoever, you will:",
      ),
    ),
    bullets(
      [t("a. Keep confidential and not disclose to any unauthorized persons")],
      [t("     i) All Firm information, business, and financial interests.")],
      [
        t(
          "     ii) Firm intelligence, consisting of sensitive research, either acquired or in the process of being carried out.",
        ),
      ],
      [t("     iii) Technical capability learned, acquired or developed during the course of employment.")],
      [t("     iv) Commercial Intelligence disclosed to you and/or acquired by you during your employment.")],
      [
        t(
          "     v) Any Client/Participant related Personal or Work/Business related details that you shall be provided, learned, gathered or come across during the course of your employment under any circumstances. You will at all times, maintain 100% Client/Participant Confidentiality at all times about sensitive as well as non sensitive information.",
        ),
      ],
      [
        t(
          "b. Not employ, use and/or engage the confidential information for any purposes other than the business of the Firm and only during the course of your employment with the Firm.",
        ),
      ],
      [
        t(
          "c. Solicit or endeavor to entice any employee or person involved, directly or indirectly, from any of the Firm's operations.",
        ),
      ],
      [
        t(
          "d. You shall faithfully and to the best of your ability, perform your duties that may be entrusted to you from the time to time by the management. You will be bound by rules, regulations, and orders promulgated by the management in relation to conduct, discipline and policy matters.",
        ),
      ],
      [
        t(
          "e. You will not seek membership of any local or public bodies without first obtaining the specific permission of the management. In the event of your becoming a member without following the due process as mentioned, it shall amount to contravention of the provision of employment conditions and the management reserves the right to take appropriate actions including dispensing with your services, as it may deem fit.",
        ),
      ],
      [
        t(
          "f. Other than the above, you will have to sign a Comprehensive Confidentiality Agreement, Training Confidentiality Agreement, Prevention of Sexual Harassment Policies, Attendance & Leave Policy, Anti Harassment & Non Discrimination Policy, Exit Policy, Conflict Policy and any other Policy introduced and/or updated by the Management from time to time on your date of joining as a necessary condition of your employment.",
        ),
      ],
    ),

    /* ── 14. Safety Precautions ──────────────────────────────────── */
    heading("14. Safety Precautions", 3),
    para(
      t(
        "While in employment with the Firm, you are required to handle with care, all office property, and equipment within and outside the premises. You shall follow and shall not be responsible for any breach of safety standards. Any books, files, documents, pdfs, videos, images (Soft copies & Hard copies), Email Account, Google Drives, Cloud Folders and Files, Hard Disks, DVDs, CDs, circulars, items of equipment of the Firm which might be supplied to you in connection with your work shall at all times remain the property of the Firm and shall be returned by you to the Firm upon your ceasing to be in the Firm's employment. If you fail to do so, the Firm is entitled to withhold payment of your dues, if any, and / or take such other steps as may be called for to recover them from you including but not restricted to filing a Police Complaint or register a Case with Judicial Authorities.",
      ),
    ),

    /* ── 15. Ownership of Content ────────────────────────────────── */
    heading("15. Ownership of Content", 3),
    para(
      t(
        "Any kind of content created by you in the course of your employment shall be the property and in the sole ownership of the Firm only. You are prohibited from reproducing, copying, claiming, plagiarising the content anywhere without prior permission in writing from the Firm.",
      ),
    ),

    /* ── 16. Jurisdiction ────────────────────────────────────────── */
    heading("16. Jurisdiction", 3),
    para(
      t(
        "All disputes arising out of this letter will be subject to the jurisdiction of the Mumbai courts. And that the Courts, Tribunals and/or authorities at Mumbai only shall have jurisdiction to entertain, try and decide such disputes or differences arising out of or pertaining to this contract of employment, irrespective of your working office being elsewhere at those times.",
      ),
    ),

    /* ── 17. Language for Communication ──────────────────────────── */
    heading("17. Language for Communication", 3),
    para(
      t(
        "English is the Language which will be used for communication with the employee any time during the employment tenure.",
      ),
    ),

    /* ── 18. Personal Information ────────────────────────────────── */
    heading("18. Personal Information", 3),
    para(
      t(
        "You will have to inform the Firm in writing in case of any change in your personal details like mobile number, alternate number, residence address, email address marital status within two working days of such change.",
      ),
    ),

    /* ── 19. Amendments ──────────────────────────────────────────── */
    heading("19. Amendments", 3),
    para(
      t(
        "Amendments to the above terms and conditions, if any will be made in writing. Please sign and return the duplicate copy of this letter of appointment (initialing each page) as a token of your having accepted the above terms and conditions or e-sign using Aadhar Based OTP System which shall be considered as digitally signed.",
      ),
    ),
    para(t("Welcome aboard and wish you the very best.")),

    /* ── Two-column sign-off ─────────────────────────────────────── */
    signature({
      forEntity: true,
      esign: true,
      name: [t("CA Manan Vasa")],
      designation: [t("Founder")],
      showDate: true,
      place: [f("place", "Place", { defaultValue: "Mumbai" })],
    }),
  ],
};

export default template;
