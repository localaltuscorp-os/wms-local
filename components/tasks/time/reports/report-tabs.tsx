"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { LayoutDashboard, Users, ListTodo, Target, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TABS: { href: string; label: string; Icon: LucideIcon; exact?: boolean }[] = [
  { href: "/tasks/time", label: "Overview", Icon: LayoutDashboard, exact: true },
  { href: "/tasks/time/employees", label: "Employees", Icon: Users },
  { href: "/tasks/time/tasks", label: "Tasks", Icon: ListTodo },
  { href: "/tasks/time/goals", label: "Goals", Icon: Target },
  { href: "/tasks/time/manager", label: "Manager", Icon: SlidersHorizontal },
];

/** The report switcher — a scrollable pill row shared by every /tasks/time page. */
export function TimeReportTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Time Intelligence reports"
      className="mb-6 flex flex-wrap gap-1.5"
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href as Route}
            aria-current={active ? "page" : undefined}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1"
            style={
              active
                ? {
                    background: "var(--color-altus-red)",
                    color: "#fff",
                    boxShadow: "0 6px 16px -10px var(--color-altus-red)",
                  }
                : {
                    background: "rgba(255,255,255,0.75)",
                    color: "var(--color-ink-strong)",
                    boxShadow: "inset 0 0 0 1px var(--color-hairline)",
                  }
            }
          >
            <t.Icon size={15} strokeWidth={2.3} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
