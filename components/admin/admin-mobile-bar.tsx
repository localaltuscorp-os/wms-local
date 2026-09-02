"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { signOut } from "firebase/auth";
import {
  Menu,
  X,
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
}

interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: "/admin" as Route, label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/activity" as Route, label: "Activity", icon: ActivityIcon },
  { href: "/admin/notifications" as Route, label: "Notifications", icon: Bell },
  { href: "/admin/employees" as Route, label: "Employees", icon: Users },
  { href: "/admin/departments" as Route, label: "Departments", icon: Building2 },
  { href: "/admin/clients" as Route, label: "Clients", icon: Briefcase },
  { href: "/admin/subjects" as Route, label: "Subjects", icon: Tag },
  { href: "/admin/outstanding-products" as Route, label: "Outstanding Products", icon: Package },
  { href: "/admin/outstanding-entities" as Route, label: "Outstanding Entities", icon: Landmark },
  { href: "/admin/outstanding-payment-modes" as Route, label: "Outstanding Modes", icon: CreditCard },
  { href: "/admin/outstanding-responsibles" as Route, label: "Outstanding Responsibles", icon: UserCog },
  { href: "/admin/holidays" as Route, label: "Holidays", icon: CalendarDays },
  { href: "/admin/salary-profiles" as Route, label: "Salary Profiles", icon: BadgeIndianRupee },
  { href: "/admin/designations" as Route, label: "Designations", icon: IdCard },
  { href: "/admin/paying-entities" as Route, label: "Paying Entities", icon: Building2 },
  { href: "/admin/settings" as Route, label: "Settings", icon: SettingsIcon },
];

/**
 * Mobile-only top bar for the admin panel. The desktop sidebar
 * (`max-md:hidden`) leaves mobile users stranded; this re-exposes
 * the same admin NAV inside a slide-in drawer triggered by a
 * hamburger in a sticky top bar.
 */
export function AdminMobileBar({ adminName, adminEmail }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // proceed — server revoke is what matters
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
    <div className="md:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-4"
      style={{
        background: "rgba(15, 23, 42, 0.96)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
        backdropFilter: "blur(20px) saturate(160%)",
      }}
    >
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label="Open admin navigation"
            className="inline-flex items-center gap-2 text-white"
          >
            <Menu size={20} strokeWidth={2.4} />
            <span className="text-table-head text-white/70 uppercase tracking-[0.10em]">
              Admin
            </span>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[60]"
            style={{
              background: "rgba(15, 23, 42, 0.55)",
              animation: "fadeOverlayIn 200ms ease-out forwards",
            }}
          />
          <Dialog.Content
            className="fixed left-0 top-0 z-[61] h-dvh w-[82vw] max-w-[320px] flex flex-col text-white"
            style={{
              background:
                "linear-gradient(180deg, rgba(15, 23, 42, 0.99), rgba(15, 23, 42, 0.96))",
              borderRight: "1px solid rgba(255, 255, 255, 0.10)",
              boxShadow: "0 20px 48px rgba(0, 0, 0, 0.35)",
              animation: "slideMenuIn 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "rgba(255, 255, 255, 0.10)" }}
            >
              <Dialog.Title className="text-table-head text-white/70 uppercase tracking-[0.10em]">
                Admin
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="inline-flex items-center justify-center size-9 rounded-full text-white/80 hover:bg-white/10 transition-colors"
                >
                  <X size={20} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
            <div
              className="flex-1 overflow-y-auto p-3 flex flex-col gap-1"
              onPointerDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("a")) setOpen(false);
              }}
            >
              {NAV.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                    style={{
                      background: active
                        ? "rgba(225, 6, 0, 0.18)"
                        : "transparent",
                      color: active ? "white" : "rgba(255, 255, 255, 0.78)",
                      border: active
                        ? "1px solid rgba(225, 6, 0, 0.42)"
                        : "1px solid transparent",
                    }}
                  >
                    <Icon size={18} strokeWidth={2.2} />
                    <span className="text-[15px] font-semibold">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div
              className="px-3 py-3 border-t flex flex-col gap-2"
              style={{ borderColor: "rgba(255, 255, 255, 0.10)" }}
            >
              <div className="flex items-center gap-3 px-2 py-1">
                <div
                  className="size-9 rounded-full flex items-center justify-center text-white font-bold"
                  style={{
                    background:
                      "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
                  }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] text-white truncate">
                    {adminName}
                  </div>
                  <div className="text-[12px] text-white/55 truncate">
                    {adminEmail}
                  </div>
                </div>
              </div>
              <Link
                href={"/" as Route}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={2.2} />
                <span className="text-[14px]">Back to app</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  handleSignOut();
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors text-left"
              >
                <LogOut size={16} strokeWidth={2.2} />
                <span className="text-[14px]">Sign out</span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div
        className="inline-flex items-center rounded-lg bg-white px-2 py-1"
        style={{ boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)" }}
      >
        <img
          src="/logo.png"
          alt="Altus Corp"
          style={{ height: 28, width: "auto", display: "block" }}
        />
      </div>
      <div className="w-8" /> {/* spacer to balance the hamburger */}
    </div>
  );
}
