"use client";

import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Shield } from "lucide-react";

/**
 * Compact, unmissable "ADMIN" pill in the header right-cluster.
 * Doubles as the shortcut to the admin panel.
 * Only renders for admins (gated by the server-side caller).
 */
export function AdminPill() {
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Link
            href={"/admin" as Route}
            aria-label="Admin — open admin panel"
            className="inline-flex items-center gap-1 rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{
              padding: "5px 10px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              background:
                "linear-gradient(135deg, #334155, #0F172A)",
              boxShadow:
                "0 2px 8px rgba(15, 23, 42, 0.45), inset 0 0 0 1px rgba(255,255,255,0.16)",
              transition:
                "transform 180ms ease, box-shadow 220ms ease, filter 180ms ease",
              willChange: "transform",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 6px 16px rgba(15, 23, 42, 0.55), inset 0 0 0 1px rgba(255,255,255,0.26)";
              e.currentTarget.style.filter = "brightness(1.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow =
                "0 2px 8px rgba(15, 23, 42, 0.45), inset 0 0 0 1px rgba(255,255,255,0.16)";
              e.currentTarget.style.filter = "";
            }}
          >
            <Shield size={11} strokeWidth={2.8} />
            <span>Admin</span>
          </Link>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            sideOffset={8}
            className="z-[80] rounded-md px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              background: "#0F172A",
              color: "#ffffff",
              animation: "userMenuIn 140ms cubic-bezier(0.16, 1, 0.3, 1)",
              maxWidth: 260,
            }}
          >
            You&rsquo;re an administrator — manage the team in Admin Panel
            <Tooltip.Arrow style={{ fill: "#0F172A" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
