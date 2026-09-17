import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, incentiveNotificationDeliveries } from "@/db/schema";
import { getIncentiveBreakup } from "@/lib/incentive/breakup";
import { renderIncentiveBreakupPdf } from "@/lib/incentive/breakup-pdf";
import { sendIncentiveBreakupEmail } from "@/lib/email/report-emails";
import { employeeEmailTargets } from "@/lib/email/recipients";
import { isActiveEmployee } from "@/lib/incentive/notifications/eligibility";

/**
 * Mail an employee their Incentive Breakup Letter the moment they are paid.
 *
 * WHY THIS EXISTS: an incentive can be paid from three places (the salary payout
 * board, the Status editor, the Entries editor) and the employee learns the
 * amount from a notice that carries a number and nothing else. The letter is the
 * document that says WHICH incentives, approved against what, less any reversal,
 * net of what — and it is only useful at the moment the money lands.
 *
 * IT REUSES THE EXISTING DOCUMENT. `getIncentiveBreakup` → `renderIncentiveBreakupPdf`
 * are the same pair the on-demand route serves (`/salary/incentive-breakup`), so
 * the PDF in the inbox is byte-for-byte the one the employee can download later.
 * A second renderer here would drift from it.
 *
 * ── IDEMPOTENT, AND RE-SENDABLE ONLY ON A REAL CHANGE ─────────────────────────
 * The claim row's `versionKey` carries the amount that was paid
 * (`breakup:<month>:<paid>`). A replay of the same payout therefore claims
 * nothing and sends nothing, while a genuine second payment in the same month —
 * a top-up, which the payout planner allows — moves the total and legitimately
 * sends a new letter. Same shape as the paid-notice's `<leg>-paid:<amount>:<date>`.
 *
 * ── FAILURE DIRECTION ─────────────────────────────────────────────────────────
 * Never throws. The money has already moved by the time this runs, so a mail or
 * render failure must not surface as a failed payout and tempt a second press.
 * A FAILED send releases its claim so a later retry can still deliver; the
 * letter stays downloadable from the breakup route either way.
 */
export async function mailIncentiveBreakup(input: {
  employeeId: string;
  month: string;
  /** What this payout actually disbursed — versions the claim. */
  paidTotal: number;
}): Promise<"sent" | "duplicate" | "inactive" | "failed" | "skipped"> {
  try {
    const [emp] = await db
      .select({
        name: employees.name,
        email: employees.email,
        officialEmail: employees.officialEmail,
        personalEmail: employees.personalEmail,
        isActive: employees.isActive,
        employmentStatus: employees.employmentStatus,
      })
      .from(employees)
      .where(eq(employees.id, input.employeeId))
      .limit(1);

    // Same gate every other incentive notice uses — an employee who has left is
    // not mailed a document about money that was paid before they left.
    if (!emp || !isActiveEmployee(emp)) return "inactive";

    const to = employeeEmailTargets(emp);
    if (to.length === 0) {
      console.error(`[incentive] no address on file for ${emp.name}; breakup mail skipped`);
      return "skipped";
    }

    const versionKey = `breakup:${input.month}:${input.paidTotal.toFixed(2)}`;
    const [claim] = await db
      .insert(incentiveNotificationDeliveries)
      .values({
        eventType: "incentive_breakup",
        subjectId: input.employeeId,
        recipientId: input.employeeId,
        versionKey,
      })
      .onConflictDoNothing()
      .returning({ id: incentiveNotificationDeliveries.id });
    if (!claim) return "duplicate";

    try {
      const data = await getIncentiveBreakup(input.employeeId, input.month);
      const pdf = await renderIncentiveBreakupPdf(data, { generatedBy: "Altus Corp" });
      const filename = `Incentive-Breakup-${(data.employeeName || emp.name).replace(/\s+/g, "")}-${input.month}.pdf`;

      const res = await sendIncentiveBreakupEmail({
        recipient: { email: to, name: emp.name },
        monthLabel: data.monthLabel,
        netTotal: data.totals.net,
        reversal: data.totals.reversal,
        paidAmount: data.totals.paid,
        pdf,
        filename,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      });
      if (res.error) {
        // Release the claim: a genuine retry must still be able to deliver it.
        await db
          .delete(incentiveNotificationDeliveries)
          .where(eq(incentiveNotificationDeliveries.id, claim.id));
        console.error(`[incentive] breakup mail failed for ${emp.name}:`, res.error);
        return "failed";
      }
      return "sent";
    } catch (err) {
      await db
        .delete(incentiveNotificationDeliveries)
        .where(eq(incentiveNotificationDeliveries.id, claim.id));
      throw err;
    }
  } catch (err) {
    console.error("[incentive] breakup mail threw:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
