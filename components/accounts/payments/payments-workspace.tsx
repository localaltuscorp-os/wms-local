import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, WalletCards } from "lucide-react";
import { PAYMENT_TABS, type PaymentTabId } from "@/lib/accounts/payments";

export function PaymentsWorkspace({ activeTabId }: { activeTabId: PaymentTabId }) {
  const activeTab = PAYMENT_TABS.find((tab) => tab.id === activeTabId) ?? PAYMENT_TABS[0];

  return (
    <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
      <Link href={"/accounts" as Route} className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
        <ArrowLeft size={14} strokeWidth={2.4} /> Accounts Index
      </Link>

      <section className="mt-2" aria-label="Payments navigation">
        <div role="tablist" aria-label="Payments tabs" className="flex flex-wrap gap-2 border-b border-hairline pb-3">
          {PAYMENT_TABS.map((tab) => {
            const selected = tab.id === activeTab.id;
            return (
              <Link
                key={tab.id}
                id={`payments-tab-${tab.id}`}
                role="tab"
                aria-selected={selected}
                aria-controls="payments-tab-panel"
                href={`/accounts/payments?tab=${tab.id}` as Route}
                className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors"
                style={selected ? { background: "rgba(225,6,0,0.10)", color: "var(--color-altus-red-deep)" } : { color: "var(--color-ink-soft)" }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <section
          id="payments-tab-panel"
          role="tabpanel"
          aria-labelledby={`payments-tab-${activeTab.id}`}
          className="mt-5 border-y border-hairline bg-surface-card px-6 py-7 max-md:px-4"
        >
          <div className="flex items-start justify-between gap-6 max-md:flex-col">
            <div className="flex min-w-0 gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-altus-red" aria-hidden>
                <WalletCards size={20} strokeWidth={2.3} />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase text-ink-soft">Payments subsection</p>
                <h2 className="mt-1 text-xl font-extrabold text-ink-strong">{activeTab.label}</h2>
                <p className="mt-2 max-w-2xl text-[14px] font-medium leading-6 text-ink-muted">{activeTab.detail}</p>
              </div>
            </div>
            <Link
              href={activeTab.href as Route}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-altus-red px-3.5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-altus-red-deep"
            >
              Open {activeTab.destination} <ArrowUpRight size={15} strokeWidth={2.5} />
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
