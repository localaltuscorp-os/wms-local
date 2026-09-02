import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Users,
  MailCheck,
  ListTodo,
  AlertTriangle,
  UserPlus,
  Plus,
  Activity as ActivityIcon,
  Settings as SettingsIcon,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { getAdminOverview } from "@/lib/queries/admin";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { AdminKpiTile, type AdminKpiTone } from "@/components/admin/admin-kpi-tile";
import { AdminActivityPreview } from "@/components/admin/admin-activity-preview";
import type { TaskStatus } from "@/db/enums";

export const dynamic = "force-dynamic";

interface KpiEntry {
  label: string;
  value: number;
  hint?: string;
  tone: AdminKpiTone;
  // Pre-rendered icon element (Next 16 RSC: can't pass component classes
  // across the server→client boundary).
  icon: ReactNode;
  href?: Route;
}

interface QuickAction {
  label: string;
  description: string;
  href: Route;
  icon: LucideIcon;
  tone: "altus" | "ink";
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Invite employee",
    description: "Send an invite email",
    href: "/admin/employees" as Route,
    icon: UserPlus,
    tone: "altus",
  },
  {
    label: "New Task",
    description: "Create + assign a doer",
    href: "/tasks/new" as Route,
    icon: Plus,
    tone: "ink",
  },
  {
    label: "View activity",
    description: "Full audit timeline",
    href: "/admin/activity" as Route,
    icon: ActivityIcon,
    tone: "ink",
  },
  {
    label: "Settings",
    description: "Org-wide knobs",
    href: "/admin/settings" as Route,
    icon: SettingsIcon,
    tone: "ink",
  },
];

export default async function AdminOverviewPage() {
  const [d, statusDisplay] = await Promise.all([
    getAdminOverview(),
    getStatusDisplayMap(),
  ]);
  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;

  const tiles: KpiEntry[] = [
    {
      label: "Active employees",
      value: d.activeEmployees,
      hint: "Joined + still on the roster",
      tone: "blue",
      icon: <Users size={16} strokeWidth={2.2} />,
      href: "/admin/employees" as Route,
    },
    {
      label: "Pending invites",
      value: d.pendingInvites,
      hint: "Sent, awaiting first sign-in",
      tone: "amber",
      icon: <MailCheck size={16} strokeWidth={2.2} />,
      href: "/admin/employees" as Route,
    },
    {
      label: "Open tasks",
      value: d.openTasks,
      hint: "Not started · initiated · follow-up · need-help",
      tone: "green",
      icon: <ListTodo size={16} strokeWidth={2.2} />,
      href: "/tasks" as Route,
    },
    {
      label: "Overdue",
      value: d.overdueTasks,
      hint: "Past due, still open",
      tone: "red",
      icon: <AlertTriangle size={16} strokeWidth={2.2} />,
      href: "/tasks" as Route,
    },
  ];

  return (
    <div>
      {/* Page header */}
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Overview
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
          The shape of the team today.
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl">
          A snapshot of headcount, pending work, and the most recent
          activity across Altus Corp.
        </p>
      </header>

      {/* KPI tier */}
      <section className="grid grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
        {tiles.map((t, i) => (
          <AdminKpiTile
            key={t.label}
            label={t.label}
            value={t.value}
            hint={t.hint}
            tone={t.tone}
            icon={t.icon}
            href={t.href}
            index={i}
          />
        ))}
      </section>

      {/* Quick actions */}
      <section className="mt-10">
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-subtle font-bold mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-3">
          {QUICK_ACTIONS.map((q) => {
            const Icon = q.icon;
            const isAltus = q.tone === "altus";
            return (
              <Link
                key={q.label}
                href={q.href}
                className="group flex items-start gap-3 rounded-xl px-4 py-3.5 bg-surface-card border border-hairline transition-all hover:-translate-y-px"
                style={{
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors"
                  style={
                    isAltus
                      ? {
                          background:
                            "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                          color: "#ffffff",
                          boxShadow:
                            "0 4px 10px -4px rgba(225, 6, 0, 0.45)",
                        }
                      : {
                          background: "rgba(15, 23, 42, 0.04)",
                          color: "var(--color-ink-strong)",
                          border: "1px solid rgba(15, 23, 42, 0.06)",
                        }
                  }
                >
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold text-ink-strong">
                    {q.label}
                  </span>
                  <span className="block text-[11.5px] text-ink-subtle mt-0.5">
                    {q.description}
                  </span>
                </span>
                <ArrowUpRight
                  size={14}
                  strokeWidth={2.2}
                  className="shrink-0 mt-1 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent activity */}
      <section className="mt-10">
        <AdminActivityPreview events={d.recentActivity} statusLabels={statusLabels} />
      </section>
    </div>
  );
}
