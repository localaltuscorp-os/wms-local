import { requireAdmin } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getIntegrationHealth } from "@/lib/queries/integration-health";
import { listRecentDispatchFailures, getDispatchLogTotals } from "@/lib/queries/dispatch-log";
import { listRecurringTemplates } from "@/lib/queries/recurring-templates";
import { getNotificationMatrix } from "@/lib/queries/notification-matrix";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { SettingsTabGeneral } from "@/components/admin/settings-tab-general";
import { SettingsTabStatuses } from "@/components/admin/settings-tab-statuses";
import { SettingsTabIntegrations } from "@/components/admin/settings-tab-integrations";
import { SettingsTabNotifications } from "@/components/admin/settings-tab-notifications";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const [
    settings,
    statusDisplay,
    integrations,
    matrix,
    dispatchFailures,
    dispatchTotals,
    recurringTemplates,
  ] = await Promise.all([
    getOrgSettings(),
    getStatusDisplayMap(),
    getIntegrationHealth(),
    getNotificationMatrix(),
    listRecentDispatchFailures({ limit: 50 }),
    getDispatchLogTotals(),
    listRecurringTemplates(),
  ]);

  return (
    <div>
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Settings
        </div>
        <h1
          className="mt-1 text-ink-strong max-md:!text-[32px]"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Organisation settings
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl">
          Identity, locale, statuses, integrations, and notification routing.
          Changes take effect immediately.
        </p>
      </header>

      <SettingsTabs
        general={<SettingsTabGeneral current={settings} />}
        statuses={<SettingsTabStatuses display={statusDisplay} />}
        integrations={
          <SettingsTabIntegrations
            rows={integrations}
            dispatchFailures={dispatchFailures}
            dispatchTotals={dispatchTotals}
            recurringTemplates={recurringTemplates}
          />
        }
        notifications={<SettingsTabNotifications initial={matrix} />}
      />
    </div>
  );
}
