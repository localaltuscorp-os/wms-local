"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { signOut } from "firebase/auth";
import {
  LayoutGrid,
  Activity as ActivityIcon,
  Bell,
  Users,
  Building2,
  Briefcase,
  Tag,
  Package,
  Landmark,
  CreditCard,
  UserCog,
  CalendarDays,
  BadgeIndianRupee,
  IdCard,
  Settings as SettingsIcon,
  ArrowLeft,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";

interface Props {
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
}

interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Exact match required (used for /admin itself, so it doesn't stay active
   *  on every nested page). */
  exact?: boolean;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: "/admin" as Route,             label: "Overview",    icon: LayoutGrid,    exact: true },
  { href: "/admin/activity" as Route,    label: "Activity",    icon: ActivityIcon },
  { href: "/admin/notifications" as Route, label: "Notifications", icon: Bell },
  { href: "/admin/employees" as Route,   label: "Employees",   icon: Users },
  { href: "/admin/departments" as Route, label: "Departments", icon: Building2 },
  { href: "/admin/clients" as Route,     label: "Clients",     icon: Briefcase },
  { href: "/admin/subjects" as Route,    label: "Subjects",    icon: Tag },
  { href: "/admin/outstanding-products" as Route,      label: "Outstanding Products", icon: Package },
  { href: "/admin/outstanding-entities" as Route,      label: "Outstanding Entities", icon: Landmark },
  { href: "/admin/outstanding-payment-modes" as Route, label: "Outstanding Modes",    icon: CreditCard },
  { href: "/admin/outstanding-responsibles" as Route,  label: "Outstanding Responsibles", icon: UserCog },
  { href: "/admin/holidays" as Route,    label: "Holidays",    icon: CalendarDays },
  { href: "/admin/salary-profiles" as Route, label: "Salary Profiles", icon: BadgeIndianRupee },
  { href: "/admin/designations" as Route,    label: "Designations",    icon: IdCard },
  { href: "/admin/paying-entities" as Route, label: "Paying Entities", icon: Building2 },
  { href: "/admin/settings" as Route,    label: "Settings",    icon: SettingsIcon },
];

export function AdminSidebar({ adminName, adminEmail, avatarUrl }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Continue regardless — the server-side revoke is what matters.
    }
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/login" as Route);
  }

  const initials = adminName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      // sticky + h-screen pins the entire sidebar to the viewport so the
      // Back / Sign out footer is always one click away on long pages
      // (employees, activity, notifications). Without this the aside grew
      // with the page and the footer ended up below the fold.
      className="header-dark sticky top-0 self-start h-screen max-h-screen relative w-[284px] shrink-0 flex flex-col max-md:hidden"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Brighter radial accent washes — mirror the public-app header treatment */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 0% 0%, rgba(225, 6, 0, 0.22), transparent 70%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(168, 85, 247, 0.16), transparent 70%)",
        }}
      />

      {/* Inner column uses h-full (from the sticky parent's h-screen) so the
          footer is pinned via flex; the nav area scrolls if it ever grows
          beyond the available height. */}
      <div className="relative flex flex-col h-full overflow-hidden">
        {/* Brand block — logo on a white panel so the indigo block in the
            logo stays visible against the dark sidebar surface. */}
        <div className="px-6 pt-8 pb-6 shrink-0">
          <div
            className="inline-flex items-center gap-2.5 rounded-xl bg-white px-3 py-2"
            style={{
              boxShadow:
                "0 4px 14px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
            }}
          >
            <img
              src="/logo.png"
              alt="Altus Corp"
              style={{ height: 48, width: "auto", display: "block" }}
            />
            <span
              className="inline-flex items-center text-[10px] font-bold uppercase text-white px-2 py-0.5 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 2px 8px rgba(225, 6, 0, 0.35)",
                letterSpacing: "0.08em",
              }}
            >
              Admin
            </span>
          </div>
          <p className="text-[12.5px] mt-3 text-white/60">altuscorp.com</p>
        </div>

        {/* Avatar + identity chip */}
        <div className="px-6 pb-5 shrink-0">
          <div
            className="flex items-center gap-3 rounded-xl p-3"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
            }}
          >
            <span
              className="inline-flex rounded-full shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))",
                padding: 1.5,
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={adminName}
                  className="h-10 w-10 rounded-full object-cover block"
                />
              ) : (
                <span
                  className="h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, #475569, #1f2937)",
                  }}
                >
                  {initials}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-white truncate">
                {adminName}
              </div>
              <div className="text-[12.5px] text-white/60 truncate">
                {adminEmail}
              </div>
            </div>
          </div>
        </div>

        {/* Nav items — scrollable if they ever exceed the available height */}
        <nav className="px-3 flex flex-col gap-1 flex-1 overflow-y-auto min-h-0">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group relative flex items-center gap-3 px-3.5 py-3 rounded-lg text-[15px] font-medium transition-all"
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                        color: "#ffffff",
                        boxShadow:
                          "0 8px 22px -10px rgba(225, 6, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.14)",
                      }
                    : {
                        color: "rgba(255, 255, 255, 0.80)",
                      }
                }
              >
                {!active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      background: "rgba(255, 255, 255, 0.06)",
                    }}
                  />
                )}
                <Icon
                  size={18}
                  strokeWidth={2.2}
                  className="relative shrink-0"
                  style={{
                    color: active
                      ? "rgba(255, 255, 255, 0.95)"
                      : "rgba(255, 255, 255, 0.65)",
                  }}
                />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer — pinned to the bottom of the sticky h-screen aside */}
        <div
          className="px-3 pb-6 pt-3 shrink-0"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.10)" }}
        >
          <Link
            href={"/" as Route}
            className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[14px] text-white/75 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <ArrowLeft
              size={16}
              strokeWidth={2.2}
              className="transition-transform group-hover:-translate-x-0.5"
            />
            Back to app
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[14px] text-white/75 hover:text-white hover:bg-white/[0.06] transition-colors text-left"
          >
            <LogOut size={16} strokeWidth={2.2} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
