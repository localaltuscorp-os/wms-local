import { PageShell } from "@/components/layout/page-shell";

/** Shown when migration 0227 has not been applied — actionable, not a stack trace. */
export function RegisterSetupNeeded({ title }: { title: string }) {
  return (
    <PageShell>
      <div className="mx-auto max-w-xl rounded-2xl border border-hairline-strong bg-white px-8 py-12 text-center">
        <h1 className="text-[20px] font-bold text-ink-strong">{title} needs its database tables</h1>
        <p className="mt-2 text-[14px] text-ink-muted">
          Apply <code className="font-mono">db/migrations/0227_hr_address_book_asset_register.sql</code> (for example with{" "}
          <code className="font-mono">pnpm db:migrate</code>), then reload this page.
        </p>
      </div>
    </PageShell>
  );
}
