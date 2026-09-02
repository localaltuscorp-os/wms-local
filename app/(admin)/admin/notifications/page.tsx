import { listNotifications, getNotificationDeliveryStats } from "@/lib/queries/notifications";
import { listEmployees } from "@/lib/queries/employees";
import { NotificationList } from "@/components/admin/notification-list";
import { NotificationFilterBar } from "@/components/admin/notification-filter-bar";

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
    <div>
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Notifications
        </div>
        <h1
          className="mt-1 text-ink-strong"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Every message we sent.
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl">
          Per-notification delivery log across email, Slack, WhatsApp, and Web Push.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3 mb-6 max-md:grid-cols-2">
        <StatCard label="Last 24h" value={stats.total24h} />
        <StatCard label="Failures" value={stats.failures24h} tone="red" />
        <StatCard label="Email" value={stats.byChannel24h.email} />
        <StatCard
          label="Slack + WA + Push"
          value={stats.byChannel24h.slack + stats.byChannel24h.whatsapp + stats.byChannel24h.push}
        />
      </div>

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
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "red" }) {
  return (
    <div className="rounded-section border border-hairline bg-surface-card p-4">
      <div className="text-[10px] uppercase tracking-[0.10em] font-bold text-ink-subtle">{label}</div>
      <div
        className={`mt-1 text-display-md font-serif italic ${tone === "red" ? "text-altus-red" : "text-ink-strong"}`}
      >
        {value}
      </div>
    </div>
  );
}
