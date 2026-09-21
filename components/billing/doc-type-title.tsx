"use client";

import * as React from "react";
import { BILLING_DOC_TYPE_LABELS, type BillingDocType } from "@/db/enums";

/**
 * THE PAGE TITLE AND THE TYPE TOGGLE, KEPT IN STEP.
 *
 * Manan, 2026-09-16: clicking Quotation left the heading reading "New tax
 * invoice".
 *
 * The heading names the DOCUMENT TYPE, and it was rendered on the server from
 * the `?type=` search param — fixed at first paint — while the toggle that
 * actually sets the type lives in the form and goes on changing. Two controls
 * describing one thing, disagreeing from the first click.
 *
 * The fix is not a second heading (that was the first attempt, and it left the
 * page with two). It is one heading, in the place it already occupied, reading
 * from the same state the toggle writes.
 *
 * WHY A CONTEXT AND NOT A PROP. The heading sits in the page header, beside the
 * back link; the toggle is deep inside the form. Their only common ancestor is
 * the page, which is a SERVER component and cannot hold React state. So the
 * provider — a client component — wraps both and owns the value, the header
 * reads it, and the form writes to it.
 *
 * OPTIONAL BY DESIGN. `useDocTypeTitle` returns null outside a provider, and the
 * form falls back to its own internal state. The edit screen renders the same
 * form under no provider at all (it is titled by its document number, which
 * does not change), and must keep working untouched.
 */

interface DocTypeCtx {
  docType: BillingDocType;
  setDocType: (t: BillingDocType) => void;
}

const Ctx = React.createContext<DocTypeCtx | null>(null);

export function useDocTypeTitle(): DocTypeCtx | null {
  return React.useContext(Ctx);
}

export function DocTypeTitleProvider({
  initial,
  children,
}: {
  initial: BillingDocType;
  children: React.ReactNode;
}) {
  const [docType, setDocType] = React.useState<BillingDocType>(initial);
  const value = React.useMemo(() => ({ docType, setDocType }), [docType]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The h1 itself — same type, size and dot the page rendered before. */
export function NewDocumentTitle({ fallback }: { fallback: BillingDocType }) {
  const ctx = useDocTypeTitle();
  const docType = ctx?.docType ?? fallback;
  return (
    <>
      <h1
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(22px,2.4vw,30px)",
          letterSpacing: "-0.02em",
        }}
      >
        New {BILLING_DOC_TYPE_LABELS[docType].toLowerCase()}
      </h1>
      <span className="h-2 w-2 rounded-full" style={{ background: "#E10600" }} aria-hidden />
    </>
  );
}
