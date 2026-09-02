/**
 * FULL & FINAL SETTLEMENT LETTER — separation family.
 *
 * The closing settlement statement issued when an employee is relieved: it
 * confirms release from service, lays out the earnings/deductions ledger as a
 * "Particular : ₹<amount>" run of term rows, states the net payable and the
 * payment method/date, and closes with the CA's signature.
 *
 * Authored against the declarative letter model — see ../types. Everything that
 * is not a red field is frozen prose. PURE + CLIENT-SAFE.
 */

import { type LetterTemplate, t, f, para, heading, term, signature } from "../types";

const template: LetterTemplate = {
  key: "ffs",
  title: "Full & Final Settlement Letter",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "Confirm relief from service and settle the final earnings/deductions ledger.",
  blocks: [
    heading("FULL AND FINAL SETTLEMENT LETTER", 1),

    para(t("Date: "), f("date", "Date", { placeholder: "DD/MM/YYYY", date: true })),

    para(t("To:")),
    para(t("Employee Name: "), f("employeeName", "Employee Name", { placeholder: "Full name" })),
    para(t("Subject: Full and Final Settlement")),

    para(t("Dear "), f("employeeName", "Employee Name"), t(",")),

    para(
      t("This letter confirms that you have been relieved from the services of "),
      f("company", "Firm Name", { defaultValue: "Altus Corp" }),
      t(" effective "),
      f("lastWorkingDate", "Last Working Date", { placeholder: "e.g. 31 July 2026", date: true }),
      t(", following the completion of all exit formalities."),
    ),

    para(
      t(
        "We inform you that your Full and Final Settlement has been processed. The details are as follows:",
      ),
    ),

    /* Particulars / Amount (₹) ledger — each row a "Particular : ₹<field>". */
    term("Salary up to Last Working Date", [t("₹"), f("salaryToLWD", "Amount")]),
    term("Leave Encashment", [t("₹"), f("leaveEncashment", "Amount")]),
    term("Incentives/Bonus (if applicable)", [t("₹"), f("incentivesBonus", "Amount")]),
    term("Reimbursements", [t("₹"), f("reimbursements", "Amount")]),
    term("Other Earnings", [t("₹"), f("otherEarnings", "Amount")]),
    term("Gross Payable", [t("₹"), f("grossPayable", "Amount")]),
    term("Notice Pay Recovery (if applicable)", [t("₹"), f("noticePayRecovery", "Amount")]),
    term("Loan/Advance Recovery", [t("₹"), f("loanAdvanceRecovery", "Amount")]),
    term("Tax/Statutory Deductions", [t("₹"), f("taxDeductions", "Amount")]),
    term("Other Deductions", [t("₹"), f("otherDeductions", "Amount")]),
    term("Total Deductions", [t("₹"), f("totalDeductions", "Amount")]),
    term("Net Amount Payable", [t("₹"), f("netPayable", "Amount")]),

    para(
      t("The net settlement amount of ₹"),
      f("netPayable", "Net Amount"),
      t(" has been paid to you through "),
      f("paymentMethod", "Payment Method", { placeholder: "Bank Transfer/Cheque/Other" }),
      t(" on "),
      f("paymentDate", "Payment Date", { placeholder: "DD/MM/YYYY", date: true }),
      t("."),
    ),

    para(
      t(
        "By accepting this settlement, it is understood that all salary, benefits, reimbursements, and other dues arising out of your employment with ",
      ),
      f("company", "Firm Name"),
      t(
        " have been fully settled, and no further financial claims remain outstanding from either party, except as may be required by applicable law.",
      ),
    ),

    para(
      t("We thank you for your contributions during your tenure with "),
      f("company", "Firm Name"),
      t(" and wish you every success in your future endeavors."),
    ),

    para(t("Sincerely,")),

    signature({
      forEntity: false,
      esign: false,
      name: [t("CA Manan Vasa")],
      designation: [t("Sign")],
    }),
  ],
};

export default template;
