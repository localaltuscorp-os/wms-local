import "server-only";

import { loadOutstanding } from "@/lib/queries/outstanding";
import { todayISO, rollingHorizon } from "@/lib/outstanding/horizon";

/**
 * THE JOIN BETWEEN BILLING AND OUTSTANDING.
 *
 * Billing says what was invoiced; Outstanding says what has not come back. They
 * are the two halves of one question about a customer, and nothing connected
 * them — you had to read a name off the customer record and go hunting for it
 * in a ledger of every receivable the company holds.
 *
 * ── IT REUSES THE DASHBOARD'S OWN ENGINE, DELIBERATELY ────────────────────
 * The figures come from `loadOutstanding`, the same function the Outstanding
 * dashboard calls, filtered to one client. The obvious alternative — a tidy
 * SUM over `outstanding_entries` — is wrong twice over: that table is EMPTY on
 * this database (the live receivables are `outstanding_contracts` →
 * `outstanding_installments`), and the numbers on screen are DERIVED, not
 * stored. A contract's schedule is materialised, collections are allocated
 * against it, and only then does an installment have a balance and a state.
 *
 * Reimplementing that in SQL would produce a second answer to the same
 * question, and the day the two disagreed the customer panel would be quietly
 * wrong while looking authoritative. Calling the engine costs a load of ~38
 * contracts and ~148 installments, which is cheaper than being wrong.
 *
 * ── MATCHED ON THE NAME, AND WHAT THAT COSTS ──────────────────────────────
 * A receivable names its client in free text (`outstanding_contracts
 * .client_name`); there is no foreign key to `billing_customers`. So the join
 * is the name, trimmed and case-insensitive — which is what makes "Acme Pvt
 * Ltd" and "acme pvt ltd " the same customer, and what makes a customer spelled
 * differently in the two modules read as nothing outstanding. That is a wrong
 * answer wearing a right answer's clothes, so the panel says it matched on the
 * name and shows "no receivables matched this name" rather than a confident
 * zero.
 *
 * THE DURABLE FIX is a nullable `customer_id` on `outstanding_contracts`, set
 * when a contract is raised against a known customer and backfilled by name
 * once. This function is the shape that would keep — only the predicate below
 * changes. By name first means the connection works today, on the rows that
 * already exist, with no migration to run against a database that is already
 * carrying 26 unapplied ones.
 */

export interface CustomerOutstanding {
  /** Installments whose client matches, in any state. */
  entries: number;
  /** Open balance across everything not yet paid. */
  balance: number;
  /** The part of that balance already past its due date. */
  overdue: number;
  /** Unpaid installments whose due date is still ahead. */
  notDueCount: number;
  /** The oldest unpaid due date, ISO. Null when nothing is open. */
  oldestDue: string | null;
}

const EMPTY: CustomerOutstanding = {
  entries: 0,
  balance: 0,
  overdue: 0,
  notDueCount: 0,
  oldestDue: null,
};

export async function outstandingForCustomer(
  customerName: string,
): Promise<CustomerOutstanding> {
  const name = customerName.trim().toLowerCase();
  if (!name) return EMPTY;

  const today = todayISO();
  const { derived } = await loadOutstanding(today, rollingHorizon(today));
  const mine = derived.filter((r) => r.clientName.trim().toLowerCase() === name);
  if (mine.length === 0) return EMPTY;

  const open = mine.filter((r) => r.state !== "paid");
  return {
    entries: mine.length,
    balance: open.reduce((n, r) => n + r.balance, 0),
    overdue: open.filter((r) => r.state === "overdue").reduce((n, r) => n + r.balance, 0),
    notDueCount: open.filter((r) => r.state !== "overdue").length,
    oldestDue:
      open.length === 0
        ? null
        : open.reduce((min, r) => (r.dueDate < min ? r.dueDate : min), open[0]!.dueDate),
  };
}
