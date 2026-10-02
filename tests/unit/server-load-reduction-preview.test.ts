import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("server-load reduction preview", () => {
  it("does not schedule the explicitly paused jobs", () => {
    const cfg = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    const paused = [
      ["/api/cron/task-auto-archive"],
      ["/api/cron/meet-reconcile"],
      ["/api/cron/backup"],
      ["/api/cron/dcc-daily-report"],
      ["/api/cron/compliance-reminders?job=daily"],
      ["/api/cron/compliance-reminders?job=founder"],
      ["/api/cron/weekly-goals?job=incomplete", "15 4 * * 1"],
      ["/api/cron/goals-sunday-report"],
      ["/api/cron/dcc-calendar-sync"],
      ["/api/cron/hr-confirmations"],
      ["/api/cron/hr-records-drive"],
    ] as const;

    for (const [path, schedule] of paused) {
      expect(
        cfg.crons.some(
          (entry) => entry.path === path && (!schedule || entry.schedule === schedule),
        ),
      ).toBe(false);
    }
    expect(cfg.crons).toContainEqual({
      path: "/api/cron/weekly-goals?job=incomplete",
      schedule: "15 4 * * 0",
    });
    expect(cfg.crons).toHaveLength(33);
  });

  it("keeps paused handlers available for rollback and manual runs", () => {
    for (const route of [
      "task-auto-archive", "meet-reconcile", "backup", "dcc-daily-report",
      "compliance-reminders", "goals-sunday-report", "dcc-calendar-sync",
      "hr-confirmations", "hr-records-drive",
    ]) {
      expect(read(`app/api/cron/${route}/route.ts`).length).toBeGreaterThan(0);
    }
  });

  it("centralizes task realtime state and coalesces full refreshes", () => {
    const provider = read("components/layout/task-realtime-provider.tsx");
    const indicator = read("components/layout/live-indicator.tsx");
    expect(provider.match(/\.channel\(/g)).toHaveLength(1);
    expect(provider).toContain("TASK_REFRESH_WINDOW_MS = 20_000");
    expect(provider).toContain("if (refreshTimer) return");
    expect(indicator).not.toContain("createBrowserClient");
    expect(indicator).toContain("useTaskRealtime");
  });

  it("batches activity events and caches the nav unread count", () => {
    const tracker = read("lib/logs/client-tracker.ts");
    const notifications = read("lib/queries/notifications.ts");
    expect(tracker).toContain("FLUSH_THRESHOLD = 50");
    expect(tracker).toContain("FLUSH_INTERVAL_MS = 2 * 60_000");
    expect(notifications).toContain("getCachedUnreadCount");
    expect(notifications).toContain("revalidate: 30");
  });
});
