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
import { AdminSection } from "@/components/admin/ui/section-shell";
import { SlidersHorizontal } from "lucide-react";

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

  const dispatchFailedTotal = dispatchTotals.failed + dispatchTotals.failedTerminal;

  return (
    <AdminSection
      eyebrow="Admin · Settings"
      title="Organisation settings"
      subtitle="Identity, locale, statuses, integrations, and notification routing. Changes take effect immediately."
      icon={SlidersHorizontal}
      stats={[
        { label: "Integrations", value: integrations.length },
        { label: "Recurring templates", value: recurringTemplates.length },
        { label: "Dispatched", value: dispatchTotals.sent, tone: "green" },
        {
          label: "Failed",
          value: dispatchFailedTotal,
          tone: dispatchFailedTotal > 0 ? "red" : "neutral",
        },
      ]}
    >
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
    </AdminSection>
  );
}
