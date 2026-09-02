"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { signOut } from "firebase/auth";
import { Menu, X, LayoutGrid, LogOut, Calculator } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  ADMIN_TOP_LEVEL,
  ADMIN_GROUPS,
  isAdminNavActive,
  type AdminNavItem,
} from "./admin-nav-config";

interface Props {
  adminName: string;
  adminEmail: string;
  /** Where "Back to app" returns — the workspace the admin came from. */
  backHref: string;
  /** Super-admins also get the "Accounts" link in the drawer. */
  canSeeAccounts: boolean;
}

/**
 * Mobile-only top bar for the admin panel — light/frosted to match the desktop
 * AdminHeader. The hamburger opens a light slide-in drawer that renders the
 * same nav as the desktop header, but flat with labelled category sections
 * (dropdowns don't belong in a vertical list).
 */
export function AdminMobileBar({ adminName, adminEmail, backHref, canSeeAccounts }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // proceed — server revoke is what matters
    }
    await fetch("/api/auth/signout", { method: "POST" });
    // HARD nav so the next user on this browser can't be served cached pages.
    window.location.replace("/login");
  }

  const initials = adminName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function NavLink({ item }: { item: AdminNavItem }) {
    const active = isAdminNavActive(pathname, item);
    const Icon = item.Icon;
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[15px] font-semibold"
        style={
          active
            ? {
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                color: "#ffffff",
                boxShadow: "0 6px 16px -8px rgba(225, 6, 0, 0.55)",
              }
            : { color: "var(--color-ink-strong)" }
        }
      >
        <Icon
          size={18}
          strokeWidth={2.2}
          style={{ color: active ? "#fff" : "var(--color-ink-soft)" }}
        />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div
      className="md:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-4 header-light"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        borderBottom: "1px solid var(--color-hairline)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
      }}
    >
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label="Open admin navigation"
            className="inline-flex items-center gap-2 text-ink-strong"
          >
            <Menu size={20} strokeWidth={2.4} />
            <span className="text-[11px] font-bold text-ink-subtle uppercase tracking-[0.10em]">
              Admin
            </span>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[60]"
            style={{
              background: "rgba(15, 23, 42, 0.44)",
              animation: "fadeOverlayIn 200ms ease-out forwards",
            }}
          />
          <Dialog.Content
            className="fixed left-0 top-0 z-[61] h-dvh w-[84vw] max-w-[340px] flex flex-col"
            style={{
              background:
                "linear-gradient(180deg, #ffffff 0%, var(--color-surface-soft) 100%)",
              borderRight: "1px solid var(--color-hairline)",
              boxShadow: "0 20px 48px rgba(15, 23, 42, 0.18)",
              animation: "slideMenuIn 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <Dialog.Title className="inline-flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Altus Corp"
                  style={{ height: 26, width: "auto", display: "block" }}
                />
                <span
                  className="inline-flex items-center text-[9px] font-bold uppercase text-white px-1.5 py-0.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    letterSpacing: "0.08em",
                  }}
                >
                  Admin
                </span>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="inline-flex items-center justify-center size-9 rounded-full text-ink-soft hover:bg-black/5 transition-colors"
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
              {ADMIN_TOP_LEVEL.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
              {ADMIN_GROUPS.map((g) => (
                <div key={g.label} className="mt-2 flex flex-col gap-1">
                  <div className="nav-drawer-section">{g.label}</div>
                  {g.items.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </div>
              ))}
            </div>

            <div
              className="px-3 py-3 border-t flex flex-col gap-2"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <div className="flex items-center gap-3 px-2 py-1">
                <div
                  className="size-9 rounded-full flex items-center justify-center text-white font-bold"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] text-ink-strong font-semibold truncate">
                    {adminName}
                  </div>
                  <div className="text-[12px] text-ink-subtle truncate">
                    {adminEmail}
                  </div>
                </div>
              </div>
              <Link
                href={backHref as Route}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 transition-colors"
                style={{ color: "#000" }}
              >
                <LayoutGrid size={16} strokeWidth={2.2} />
                <span className="text-[14px] font-bold">Back to Hub</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  handleSignOut();
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-altus-red hover:bg-red-bg transition-colors text-left"
              >
                <LogOut size={16} strokeWidth={2.2} />
                <span className="text-[14px] font-medium">Sign Out</span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Link
        href={"/dashboard" as Route}
        aria-label="Back to WMS home"
        className="inline-flex items-center rounded-lg bg-white px-2 py-1"
        style={{ boxShadow: "0 1px 4px rgba(15, 23, 42, 0.10)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Altus Corp"
          style={{ height: 26, width: "auto", display: "block" }}
        />
      </Link>
      <div className="w-8" /> {/* spacer to balance the hamburger */}
    </div>
  );
}
