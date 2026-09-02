"use client";

import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ShortcutsSheet } from "@/components/header/shortcuts-sheet";
import Link from "next/link";
import type { Route } from "next";
import {
  Crown,
  User as UserIcon,
  ChevronRight,
  LogOut,
  UserCog,
  Inbox,
  Keyboard,
  FileText,
  Archive,
  ChevronUp,
} from "lucide-react";

type Props = {
  name: string;
  email: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  inboxUnread: number;
  archivedTasks: number;
  /** "rail" = the sidebar footer: a full-width bar (avatar + name + ▲) that opens
   *  the menu UPWARD. Default = the compact avatar trigger in the top header. */
  variant?: "rail";
};

export function UserMenu({
  name,
  email,
  isAdmin,
  avatarUrl,
  inboxUnread,
  archivedTasks,
  variant,
}: Props) {
  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Continue regardless — the server-side revoke below is what matters
    }
    await fetch("/api/auth/signout", { method: "POST" });
    // HARD navigation (not router.replace): a soft nav keeps Next's client
    // Router Cache, so the NEXT user signing in on this browser could be served
    // THIS user's cached pages (e.g. the admin panel). A full load wipes it.
    window.location.replace("/login");
  }

  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  // Outer container provides the gradient ring (for admins) and pulse-on-mount.
  // Inner avatar sits on a dark spacer so the gradient reads as a 2px halo.
  const ringStyle: React.CSSProperties = isAdmin
    ? {
        background:
          "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))",
        padding: 2,
        animation: "avatarRingPulse 2.6s ease-out 1",
      }
    : {
        background: "rgba(255, 255, 255, 0.18)",
        padding: 1.5,
      };

  // Shared <Avatar>, not a local img/initials pair: this one had no onError, so
  // a dead URL rendered the browser's broken-image glyph in the header on every
  // page. The shared component layers the img over the initials and drops it on
  // error, and it is the same badge the tables use.
  const avatarNode = (
    <Avatar name={name} avatarUrl={avatarUrl} size={32} title={name} />
  );

  const ringedAvatar = (
    <span className="relative inline-flex rounded-full" style={ringStyle}>
      {avatarNode}
      {inboxUnread > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full ring-2 ring-white"
          style={{ background: "var(--color-altus-red)" }}
        />
      )}
    </span>
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {variant === "rail" ? (
          <button
            aria-label={inboxUnread > 0 ? `User menu — ${inboxUnread} unread` : "User menu"}
            className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-altus-red)]"
          >
            {ringedAvatar}
            <span className="sidebar-collapsible-hide min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink-strong">{name}</span>
              <span className="block truncate text-[11px] text-ink-soft">
                {isAdmin ? "Administrator" : "Team Member"}
              </span>
            </span>
            <ChevronUp className="sidebar-collapsible-hide shrink-0 text-ink-soft" size={16} strokeWidth={2.4} />
          </button>
        ) : (
          <button
            aria-label={inboxUnread > 0 ? `User menu — ${inboxUnread} unread` : "User menu"}
            className="group relative flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-white/40 transition-transform"
            style={{ transition: "transform 200ms ease" }}
          >
            {ringedAvatar}
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={variant === "rail" ? "top" : "bottom"}
          align={variant === "rail" ? "start" : "end"}
          sideOffset={10}
          collisionPadding={12}
          className="z-[100] min-w-[240px] rounded-xl border border-[#E2E8F0] bg-white shadow-2xl p-1.5 text-sm max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
          style={{
            transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)",
            animation: "userMenuIn 180ms cubic-bezier(0.16, 1, 0.3, 1)",
            boxShadow:
              "0 24px 48px -16px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.06)",
          }}
        >
          {/* Identity header */}
          <div className="px-3 py-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex rounded-full shrink-0"
                style={
                  isAdmin
                    ? {
                        background:
                          "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))",
                        padding: 2,
                      }
                    : { background: "rgba(15, 23, 42, 0.08)", padding: 1.5 }
                }
              >
                <Avatar name={name} avatarUrl={avatarUrl} size={36} title={name} />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[#0F172A] truncate">
                  {name}
                </div>
                <div className="text-[13px] text-[#64748B] truncate">{email}</div>
              </div>
            </div>
            <div className="mt-2.5">
              {isAdmin ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-wide text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    boxShadow: "0 1px 4px rgba(225, 6, 0, 0.35)",
                  }}
                >
                  <Crown size={11} strokeWidth={2.4} />
                  Administrator
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-wide"
                  style={{
                    background: "rgba(15, 23, 42, 0.06)",
                    color: "#334155",
                  }}
                >
                  <UserIcon size={11} strokeWidth={2.4} />
                  Team Member
                </span>
              )}
            </div>
          </div>

          {/* Admin entry — only for admins, with chevron + subtle highlight */}
          {isAdmin && (
            <DropdownMenu.Item asChild>
              <Link
                href={"/admin" as Route}
                className="mt-1 flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(225, 6, 0, 0.06), rgba(244, 63, 94, 0.04))",
                  color: "#0F172A",
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Crown
                    size={14}
                    strokeWidth={2.2}
                    style={{ color: "var(--color-altus-red)" }}
                  />
                  <span className="font-medium">Admin Panel</span>
                </span>
                <ChevronRight
                  size={14}
                  strokeWidth={2.2}
                  style={{ color: "#64748B" }}
                />
              </Link>
            </DropdownMenu.Item>
          )}

          {/* Section: account */}
          <DropdownMenu.Label className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#94A3B8] font-bold">
            Account
          </DropdownMenu.Label>

          <DropdownMenu.Item asChild>
            <Link
              href={"/profile" as Route}
              className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none text-[#0F172A] data-[highlighted]:bg-[#F1F5F9]"
            >
              <span className="inline-flex items-center gap-2">
                <UserCog size={14} strokeWidth={2.2} style={{ color: "#475569" }} />
                <span className="font-medium">Profile &amp; Preferences</span>
              </span>
              <ChevronRight
                size={14}
                strokeWidth={2.2}
                style={{ color: "#94A3B8" }}
              />
            </Link>
          </DropdownMenu.Item>

          {/* Section: workspace — Documents / Inbox / Archived moved off the
              top nav into here. Inbox + Archived carry their live counts. */}
          <DropdownMenu.Label className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#94A3B8] font-bold">
            Workspace
          </DropdownMenu.Label>

          <DropdownMenu.Item asChild>
            <Link
              href={"/documents" as Route}
              className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none text-[#0F172A] data-[highlighted]:bg-[#F1F5F9]"
            >
              <span className="inline-flex items-center gap-2">
                <FileText size={14} strokeWidth={2.2} style={{ color: "#475569" }} />
                <span className="font-medium">Documents</span>
              </span>
              <ChevronRight size={14} strokeWidth={2.2} style={{ color: "#94A3B8" }} />
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href={"/inbox" as Route}
              className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none text-[#0F172A] data-[highlighted]:bg-[#F1F5F9]"
            >
              <span className="inline-flex items-center gap-2">
                <Inbox size={14} strokeWidth={2.2} style={{ color: "#475569" }} />
                <span className="font-medium">Inbox</span>
              </span>
              <span className="inline-flex items-center gap-2">
                {inboxUnread > 0 && <MenuCount n={inboxUnread} tone="red" />}
                <ChevronRight size={14} strokeWidth={2.2} style={{ color: "#94A3B8" }} />
              </span>
            </Link>
          </DropdownMenu.Item>

          {/* Archiving is admin-only, so the Archived view is too. */}
          {isAdmin && (
            <DropdownMenu.Item asChild>
              <Link
                href={"/archived" as Route}
                className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none text-[#0F172A] data-[highlighted]:bg-[#F1F5F9]"
              >
                <span className="inline-flex items-center gap-2">
                  <Archive size={14} strokeWidth={2.2} style={{ color: "#475569" }} />
                  <span className="font-medium">Archived</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  {archivedTasks > 0 && <MenuCount n={archivedTasks} tone="neutral" />}
                  <ChevronRight size={14} strokeWidth={2.2} style={{ color: "#94A3B8" }} />
                </span>
              </Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-[#E2E8F0]" />

          {/* Sir: the shortcut list lives under the profile. Opened via a
              CONTROLLED dialog — the menu closes on select, which would unmount
              an uncontrolled one before it ever painted. */}
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              setShortcutsOpen(true);
            }}
            className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none text-[#0F172A] data-[highlighted]:bg-[#F1F5F9]"
          >
            <span className="inline-flex items-center gap-2">
              <Keyboard size={14} strokeWidth={2.2} style={{ color: "#475569" }} />
              <span className="font-medium">Keyboard shortcuts</span>
            </span>
            <kbd className="rounded border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 text-[11px] font-bold text-[#475569]">
              ?
            </kbd>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-[#E2E8F0]" />

          <DropdownMenu.Item
            onSelect={handleSignOut}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none text-[#A80400] data-[highlighted]:bg-[#FEF2F2]"
          >
            <LogOut size={14} strokeWidth={2.2} style={{ color: "#A80400" }} />
            <span className="font-medium">Sign Out</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </DropdownMenu.Root>
  );
}

// Small count chip for the menu items. `red` = unread inbox (demands
// attention); `neutral` = archived total (informational).
function MenuCount({ n, tone }: { n: number; tone: "red" | "neutral" }) {
  const display = n > 99 ? "99+" : String(n);
  return (
    <span
      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums"
      style={
        tone === "red"
          ? { background: "var(--color-altus-red)", color: "#fff" }
          : { background: "#F1F5F9", color: "#475569" }
      }
    >
      {display}
    </span>
  );
}
