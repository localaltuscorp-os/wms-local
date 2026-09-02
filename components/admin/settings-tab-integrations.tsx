import type { IntegrationStatus } from "@/lib/queries/integration-health";
import type { DispatchFailureRow } from "@/lib/queries/dispatch-log";
import type { RecurringTemplateRow } from "@/lib/queries/recurring-templates";
import { IntegrationCard } from "./integration-card";
import { RecentDispatchFailures } from "./recent-dispatch-failures";
import { RecurringTemplatesList } from "./recurring-templates-list";

interface Totals {
  sent: number;
  skipped: number;
  failed: number;
  failedTerminal: number;
}

export function SettingsTabIntegrations({
  rows,
  dispatchFailures,
  dispatchTotals,
  recurringTemplates,
}: {
  rows: IntegrationStatus[];
  /** Phase 3.5-companion data. Optional so the page can omit it on
   *  legacy builds; renders nothing when empty. */
  dispatchFailures?: DispatchFailureRow[];
  dispatchTotals?: Totals;
  /** Phase 5.2 surface — active recurring task templates. */
  recurringTemplates?: RecurringTemplateRow[];
}) {
  return (
    <div className="max-w-5xl">
      <h2 className="text-display-xs mb-2">Integrations</h2>
      <p className="text-body text-ink-subtle mb-6">
        Connection state and recent delivery counts for each channel. Use the
        test button to send yourself a real notification through each one.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        {rows.map((r) => (
          <IntegrationCard key={r.channel} status={r} />
        ))}
      </div>
      {dispatchFailures && dispatchTotals && (
        <RecentDispatchFailures rows={dispatchFailures} totals={dispatchTotals} />
      )}
      {recurringTemplates && (
        <RecurringTemplatesList rows={recurringTemplates} />
      )}
    </div>
  );
}
