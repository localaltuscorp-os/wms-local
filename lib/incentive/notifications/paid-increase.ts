/**
 * "Incentive paid" notice, shared by every write path that can RAISE what has
 * been paid to an employee (the Status editor, the Entries editor, the team
 * split). When a save increases the paid amount, tell the employee after the
 * response — the save has already committed and the notice can neither block
 * nor fail it.
 *
 * Lowering a paid amount, or saving the same one again, says nothing; the
 * version key (paid total + date) keeps a repeated save from notifying twice.
 * No amounts or statuses are changed here.
 */

import { afterResponse } from "@/lib/after";
import { notifyIncentivePaid } from "@/lib/incentive/notifications/service";

export function notifyIfPaidIncreased(input: {
  employeeId: string | null;
  subjectId: string;
  leg: string;
  label: string | null;
  previousPaid: number;
  paid: number;
  paidDate: string | null;
  periodMonth: string | null;
  actorId: string;
}): void {
  const increase = Math.round((input.paid - input.previousPaid) * 100) / 100;
  const employeeId = input.employeeId;
  if (!employeeId || increase <= 0) return;
  afterResponse(() =>
    notifyIncentivePaid({
      employeeId,
      subjectId: input.subjectId,
      versionKey: `${input.leg}-paid:${input.paid.toFixed(2)}:${input.paidDate ?? ""}`,
      label: input.label,
      amount: increase,
      paidDate: input.paidDate,
      periodMonth: input.periodMonth,
      actorId: input.actorId,
    }),
  );
}
