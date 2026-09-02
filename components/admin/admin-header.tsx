"use client";

import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import type { Route } from "next";
import { signOut } from "firebase/auth";
import { LayoutGrid, LogOut, ShieldCheck, Calculator } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { AdminTopNav } from "./admin-top-nav";

interface Props {
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
  /** Where "Back to app" returns — the workspace the admin came from. */
  backHref: string;
  /** Super-admins also get the "Accounts" section pill. */
  canSeeAccounts: boolean;
}

/**
 * Light, frosted top header for the admin panel — the dark left sidebar
 * recast as a header bar, matching the main app header (`header-light` scope
 * flips the nav pills to ink-on-light, brand-red accents). Desktop only;
 * `AdminMobileBar` still owns the phone layout.
 */
export function AdminHeader({ adminName, adminEmail, avatarUrl, backHref, canSeeAccounts }: Props) {
  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Continue — the server-side revoke below is what matters.
    }
    await fetch("/api/auth/signout", { method: "POST" });
    // HARD nav so the next user on this browser can't be served cached pages.
    window.location.replace("/login");
  }

  return (
    <header className="sticky top-0 z-50 header-light max-md:hidden">
      <div
        className="relative"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <div className="relative w-full h-[84px] px-6 2xl:px-8 flex items-center gap-4 2xl:gap-6">
          {/* LEFT: logo → WMS dashboard (consistent across every module), then
              the section switcher. "Back to Hub" stays on the right. */}
          <Link
            href={"/dashboard" as Route}
            className="flex items-center shrink-0"
            aria-label="Back to WMS home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Altus Corp"
              className="h-12 w-auto"
              style={{ display: "block" }}
            />
          </Link>

          {/* Section switcher: Admin ⇄ Accounts. Accounts is super-admins only —
              clicking it leaves the admin shell and enters the Accounts module. */}
          <div className="flex items-center gap-1 rounded-full border border-hairline bg-white/60 p-1 shrink-0">
            <span
              aria-current="page"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 2px 8px rgba(225, 6, 0, 0.35)",
              }}
            >
              <ShieldCheck size={14} strokeWidth={2.6} /> Admin
            </span>
          </div>

          {/* CENTER: grouped category nav. Scrolls from the left if it ever
              gets tight, so nothing is clipped (mirrors the main header). */}
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll">
            <div className="flex w-max mx-auto">
              <AdminTopNav />
            </div>
          </div>

          {/* RIGHT: back-to-app · identity · sign out. */}
          <div className="flex items-center gap-2.5 2xl:gap-3 shrink-0">
            <Link
              href={backHref as Route}
              aria-label="Back to Hub"
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-bold border border-hairline bg-white/70 transition-colors hover:bg-black/[0.05]"
              style={{ color: "#000" }}
            >
              <LayoutGrid size={15} strokeWidth={2.4} />
              <span className="max-2xl:hidden">Back to Hub</span>
            </Link>

            <span
              className="inline-flex items-center gap-2.5 rounded-full pl-1 pr-3 py-1 border border-hairline bg-white/70 max-lg:hidden"
            >
              <span
                className="inline-flex rounded-full shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))",
                  padding: 1.5,
                }}
              >
                <Avatar name={adminName} avatarUrl={avatarUrl} size={32} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-semibold text-ink-strong truncate max-w-[160px]">
                  {adminName}
                </span>
                <span className="block text-[11.5px] text-ink-subtle truncate max-w-[160px]">
                  {adminEmail}
                </span>
              </span>
            </span>

            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-hairline bg-white/70 text-ink-soft hover:text-altus-red hover:border-altus-red transition-colors"
            >
              <LogOut size={17} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
