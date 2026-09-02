import { listNotifications, getNotificationDeliveryStats } from "@/lib/queries/notifications";
import { listEmployees } from "@/lib/queries/employees";
import { NotificationList } from "@/components/admin/notification-list";
import { NotificationFilterBar } from "@/components/admin/notification-filter-bar";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Bell } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const kindRaw = firstString(sp.kind);
  const toRaw = firstString(sp.to);
  const failuresOnly = sp.fail === "1";
  const beforeRaw = firstString(sp.before);
  const fromRaw = firstString(sp.from);
  const toDateRaw = firstString(sp.dto);

  const kinds = kindRaw ? kindRaw.split(",").filter(Boolean) : [];
  const recipientIds = toRaw ? toRaw.split(",").filter(Boolean) : [];

  const parseDate = (v: string) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const [allEmployees, stats, page] = await Promise.all([
    // Include deactivated recipients so the filter can scope to
    // historical notifications for users who have since been deactivated.
    listEmployees({ includeInactive: true }),
    getNotificationDeliveryStats(),
    listNotifications({
      kinds: kinds.length ? kinds : undefined,
      recipientIds: recipientIds.length ? recipientIds : undefined,
      from: parseDate(fromRaw),
      to: parseDate(toDateRaw),
      before: parseDate(beforeRaw),
      failuresOnly,
    }),
  ]);

  const buildLoadOlder = () => {
    if (!page.hasMore || !page.nextCursor) return null;
    const params = new URLSearchParams();
    if (kinds.length) params.set("kind", kinds.join(","));
    if (recipientIds.length) params.set("to", recipientIds.join(","));
    if (failuresOnly) params.set("fail", "1");
    if (fromRaw) params.set("from", fromRaw);
    if (toDateRaw) params.set("dto", toDateRaw);
    params.set("before", page.nextCursor);
    return `/admin/notifications?${params.toString()}`;
  };

  return (
    <AdminSection
      eyebrow="Admin · Notifications"
      title="Every message we sent"
      subtitle="Per-notification delivery log across email, Slack, WhatsApp, and Web Push."
      icon={Bell}
      stats={[
        { label: "Last 24h", value: stats.total24h },
        { label: "Failures", value: stats.failures24h, tone: "red" },
        { label: "Email", value: stats.byChannel24h.email },
        {
          label: "Slack + WA + Push",
          value:
            stats.byChannel24h.slack +
            stats.byChannel24h.whatsapp +
            stats.byChannel24h.push,
        },
      ]}
    >
      <NotificationFilterBar
        employees={allEmployees.map((e) => ({ value: e.id, label: e.name }))}
        initial={{
          kinds,
          recipientIds,
          failuresOnly,
          from: fromRaw,
          to: toDateRaw,
        }}
      />

      <NotificationList
        rows={page.rows}
        hasMore={page.hasMore}
        loadOlderHref={buildLoadOlder()}
      />
    </AdminSection>
  );
}
