"use client";

import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { LogOut, ShieldCheck, type LucideIcon } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ADMIN_TOP_LEVEL, ADMIN_GROUPS, isAdminNavActive } from "./admin-nav-config";

/**
 * Admin panel LEFT SIDEBAR, matching the vertical rail every other module
 * uses: a centred brand block (logo + Admin badge), grouped vertical nav
 * pills, and a user footer. The logo doubles as the link back to the Hub,
 * which is why there is no separate back button up here.
 *
 * Desktop only; `AdminMobileBar` still owns the phone layout. Nav items come
 * from `admin-nav-config` so the sidebar and the (legacy) top nav can never
 * drift apart.
 */
export function AdminSidebar({
  adminName,
  adminEmail,
  avatarUrl,
  backHref,
}: {
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
  backHref: string;
}) {
  const pathname = usePathname();

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      /* server-side revoke below is what matters */
    }
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.replace("/login");
  }

  const Pill = ({ href, label, Icon, active }: { href: Route; label: string; Icon: LucideIcon; active: boolean }) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-bold transition-colors ${
        active ? "text-white" : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
      }`}
      style={active ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 6px 16px -10px rgba(225,6,0,0.6)" } : undefined}
    >
      <Icon size={16} strokeWidth={2.3} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <aside
      className="sticky top-0 z-30 flex h-screen w-[248px] shrink-0 flex-col bg-surface-card max-md:hidden"
      style={{ borderRight: "1px solid var(--color-hairline)" }}
    >
      {/* Brand block: centred logo + Admin identity. The logo IS the Hub
          link now, so the standalone black "Back to Hub" pill that used to sit
          directly below it is gone -- the rail was carrying the same
          navigation twice. Same move the module rail already made; see the
          note in layout/dashboard-sidebar.tsx. */}
      <div className="flex flex-col items-center justify-center gap-1.5 py-4">
        <a
          href={backHref}
          aria-label="Return to Hub"
          // `title` as well as `aria-label`: aria-label names the link for a
          // screen reader but browsers never surface it on hover, so this is
          // what actually shows the tooltip to a mouse user.
          title="Return to Hub"
          // Space does not activate an <a> natively -- it scrolls the page --
          // so it is wired up explicitly. Tab focus and Enter are already
          // native to the anchor and need nothing.
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              window.location.assign(backHref);
            }
          }}
          className="flex cursor-pointer items-center justify-center rounded-lg outline-none transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Altus Corp" className="h-11 w-auto" style={{ display: "block" }} />
        </a>
        <span className="inline-flex items-center gap-1.5 text-[16px] font-black" style={{ color: "var(--color-altus-red)", fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}>
          <ShieldCheck size={17} strokeWidth={2.6} /> Admin
        </span>
      </div>

      <div className="mx-4 mb-1 border-t" style={{ borderColor: "var(--color-hairline)" }} />

      {/* ── Grouped vertical nav ── */}
      <nav aria-label="Admin" className="nav-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {ADMIN_TOP_LEVEL.map((it) => (
          <Pill key={it.href} href={it.href} label={it.label} Icon={it.Icon} active={isAdminNavActive(pathname, it)} />
        ))}
        {ADMIN_GROUPS.map((g) => (
          <div key={g.label} className="mt-2.5">
            <div className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-[0.09em] text-ink-subtle">
              <g.Icon size={12} strokeWidth={2.6} /> {g.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <Pill key={it.href} href={it.href} label={it.label} Icon={it.Icon} active={isAdminNavActive(pathname, it)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer: identity + sign out ── */}
      <div className="mt-auto flex items-center gap-2.5 border-t px-3 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="inline-flex shrink-0 rounded-full" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))", padding: 1.5 }}>
          {/* Shared <Avatar> — the local img had no onError, so a dead URL
              showed the broken-image glyph in the rail on every admin page. */}
          <Avatar name={adminName} avatarUrl={avatarUrl} size={32} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-bold text-ink-strong">{adminName}</span>
          <span className="block truncate text-[11px] text-ink-subtle">{adminEmail}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="inline-flex size-9 items-center justify-center rounded-full border border-hairline bg-white/70 text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
        >
          <LogOut size={16} strokeWidth={2.2} />
        </button>
      </div>
    </aside>
  );
}
