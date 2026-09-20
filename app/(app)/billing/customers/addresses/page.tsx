import Link from "next/link";
import type { Route } from "next";
import { BookUser } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listAddressBook } from "@/lib/queries/billing-customers";
import { CARD_STYLE, BILLING_PURPLE } from "@/lib/billing/ui";

/** Left-aligned, vertically centred, one line — the same cell shell the
 *  Customer Master uses, so the two tables read as one set. */
const CELL = "px-3 py-2.5 text-left align-middle whitespace-nowrap";

/** In the order asked for: the customer number first, then the company. */
const COLUMNS = [
  "Customer no.",
  "Company",
  "Type",
  "Label",
  "Address",
  "City",
  "State",
  "Pin code",
  "Country",
  "GSTIN",
] as const;

/**
 * /billing/customers/addresses — CUSTOMER ADDRESS BOOK.
 *
 * "Whatever data we filled in the KYC form goes into that section." So this
 * screen is DERIVED and has no writer of its own: every row here was entered
 * on a client's KYC form, and the way to change one is to open that client.
 * A second place to edit an address is a second place for it to be wrong.
 *
 * ONE ROW PER ADDRESS, in a table (Manan, 2026-09-20). It used to be a card
 * per client with its addresses nested inside, which reads nicely for three
 * clients and stops working at three hundred: nothing lines up, so nothing can
 * be scanned down a column or compared across clients. A table repeats the
 * customer number and company on every row deliberately — a row that only
 * makes sense because of the card it sits in is not a row.
 */
export const dynamic = "force-dynamic";

export default async function CustomerAddressBookPage() {
  await requireWorkspace("billing");
  const rows = await listAddressBook();

  return (
    <PageShell width="wide">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Billing</p>
      <h1
        className="mt-1 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(24px,2.8vw,34px)",
          letterSpacing: "-0.025em",
        }}
      >
        Customer Address Book
      </h1>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-[22px] p-10 text-center" style={CARD_STYLE}>
          <BookUser size={26} className="mx-auto text-ink-muted" />
          <p className="mt-2 text-[14px] font-bold text-ink-strong">No addresses yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-ink-muted">
            Addresses appear here as soon as a client is onboarded with one.{" "}
            <Link href={"/billing/customers/new" as Route} className="font-bold underline" style={{ color: BILLING_PURPLE }}>
              Onboard a client
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[22px]" style={CARD_STYLE}>
          <table className="w-full border-collapse text-[13px]" style={{ minWidth: 1080 }}>
            <thead>
              <tr className="bg-[#EEF1F5] text-[10.5px] uppercase tracking-[0.1em] text-ink-muted">
                {COLUMNS.map((c) => (
                  <th key={c} className={`${CELL} font-bold first:pl-4 last:pr-4`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-hairline align-middle">
                  <td className={`${CELL} pl-4 font-mono text-[12px] font-bold`} style={{ color: BILLING_PURPLE }}>
                    {a.clientCode || "–"}
                  </td>
                  <td className={`${CELL} font-semibold text-ink-strong`}>
                    {/* The company name is the way back to the only place an
                        address can be changed — this screen has no editor. */}
                    <Link href={`/billing/customers/${a.customerId}` as Route} className="hover:underline">
                      {a.customerName}
                    </Link>
                  </td>
                  <td className={CELL}>
                    <span
                      className="rounded-pill px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]"
                      style={
                        a.kind === "shipping"
                          ? { background: "#DBEAFE", color: "#1E3A8A" }
                          : { background: "#FEE2E2", color: "#991B1B" }
                      }
                    >
                      {a.kind}
                    </span>
                  </td>
                  <td className={`${CELL} text-ink-muted`}>{a.label || "–"}</td>
                  <td className={`${CELL} text-ink-strong`}>
                    {/* The four KYC address lines on ONE line. Stacked, they
                        made their row four lines tall and left every other
                        column floating against the top of it. */}
                    <span className="block max-w-[340px] truncate" title={a.lines.join(", ") || undefined}>
                      {a.lines.length ? a.lines.join(", ") : "–"}
                    </span>
                  </td>
                  <td className={`${CELL} text-ink-strong`}>{a.city || "–"}</td>
                  <td className={`${CELL} text-ink-strong`}>{a.stateName || "–"}</td>
                  <td className={`${CELL} font-mono text-[12px] text-ink-strong`}>{a.pincode || "–"}</td>
                  <td className={`${CELL} text-ink-muted`}>{a.country || "–"}</td>
                  <td className={`${CELL} pr-4 font-mono text-[12px] text-ink-muted`}>{a.gstin || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </PageShell>
  );
}
