import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link as REmailLink,
  Preview,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Shared shell for every M2.3 notification email. Lives alongside
 * `emails/_layout.tsx` (the auth-flow shell) but adds:
 *  - a multi-color accent stripe at the top of the card,
 *  - a slightly richer header (Altus Corp pill + "Altus Corp" wordmark
 *    in a serif fallback),
 *  - a footer with the inbox "manage preferences" link.
 *
 * Email clients vary wildly on gradients, so the stripe is built from
 * five solid blocks instead of `linear-gradient(...)`.  Everything else
 * is plain solid colors + 1px borders, which renders consistently in
 * Gmail/Outlook web + iOS Mail + dark-mode clients.
 */

const STRIPE_COLORS = [
  "#E10600", // altus red
  "#F43F5E", // rose
  "#A855F7", // purple
  "#3B82F6", // blue
  "#10B981", // green
];

const SERIF_STACK =
  '"Instrument Serif", Georgia, "Times New Roman", Times, serif';
const SANS_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function NotificationEmailLayout({
  preview,
  siteUrl,
  children,
}: {
  preview: string;
  siteUrl: string;
  children: ReactNode;
}) {
  const inboxUrl = `${stripTrailingSlash(siteUrl)}/inbox`;
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#FAFBFC",
          fontFamily: SANS_STACK,
          margin: 0,
          padding: "32px 0",
          color: "#0F172A",
        }}
      >
        <Container style={{ maxWidth: 580, margin: "0 auto", padding: 0 }}>
          {/* Header — Altus Corp pill + serif wordmark */}
          <div
            style={{
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: 999,
                backgroundColor: "#E10600",
                color: "#ffffff",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Altus Corp
            </span>
            <span
              style={{
                fontFamily: SERIF_STACK,
                color: "#0F172A",
                fontWeight: 400,
                fontStyle: "italic",
                fontSize: 22,
                letterSpacing: "-0.01em",
              }}
            >
              Altus Corp
            </span>
          </div>

          {/* Card */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Hairline + accent stripe */}
            <div
              style={{
                display: "flex",
                width: "100%",
                height: 4,
                lineHeight: 0,
              }}
            >
              {STRIPE_COLORS.map((c) => (
                <div
                  key={c}
                  style={{
                    flex: "1 1 0%",
                    backgroundColor: c,
                    height: 4,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                borderTop: "1px solid #E2E8F0",
                padding: 32,
              }}
            >
              {children}
            </div>
          </div>

          {/* Footer */}
          <Hr style={{ borderColor: "#E2E8F0", margin: "24px 0 12px" }} />
          <Text
            style={{
              fontSize: 12,
              color: "#64748B",
              textAlign: "center",
              margin: "0 0 4px",
            }}
          >
            <REmailLink
              href={inboxUrl}
              style={{ color: "#64748B", textDecoration: "underline" }}
            >
              Manage your notification preferences
            </REmailLink>
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "#94A3B8",
              textAlign: "center",
              margin: 0,
            }}
          >
            Altus Corp Dashboard
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/* Shared sub-components used by every template                        */
/* ------------------------------------------------------------------ */

export function NotificationHeadline({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{
        fontFamily: SERIF_STACK,
        fontSize: 26,
        fontStyle: "italic",
        fontWeight: 400,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
        color: "#0F172A",
        margin: "0 0 12px",
      }}
    >
      {children}
    </h1>
  );
}

export function NotificationParagraph({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: muted ? "#64748B" : "#334155",
        margin: "0 0 16px",
      }}
    >
      {children}
    </Text>
  );
}

export function NotificationCTA({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  // Built as an anchor (not <Button>) so the rendered HTML works as a
  // bulletproof button across all email clients with explicit padding.
  return (
    <div style={{ textAlign: "center", margin: "24px 0 8px" }}>
      <a
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: "#E10600",
          color: "#ffffff",
          padding: "12px 24px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
          letterSpacing: "0.01em",
        }}
      >
        {children}
      </a>
    </div>
  );
}

/**
 * A pill rendered as an inline-block — used for status chips and
 * priority badges.  Pass `tone` to pick from the project palette.
 */
export function Chip({
  tone,
  children,
}: {
  tone: ChipTone;
  children: ReactNode;
}) {
  const c = CHIP_PALETTE[tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.fg,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.01em",
        border: `1px solid ${c.border}`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A muted block-quote — used for comment bodies, decline notes, and
 * cancellation reasons.
 */
export function Quote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderLeft: "3px solid #CBD5E1",
        background: "#F8FAFC",
        padding: "12px 14px",
        margin: "0 0 20px",
        borderRadius: 4,
        fontSize: 14,
        lineHeight: 1.55,
        color: "#334155",
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A small key/value list — used to show task metadata (priority, due
 * date, initiator) under the headline.
 */
export function MetaList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div style={{ margin: "0 0 20px" }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            display: "flex",
            gap: 12,
            fontSize: 13,
            lineHeight: 1.55,
            padding: "4px 0",
            color: "#334155",
          }}
        >
          <span
            style={{
              minWidth: 84,
              color: "#94A3B8",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            {it.label}
          </span>
          <span style={{ flex: "1 1 0%" }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export type ChipTone =
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "rose"
  | "purple"
  | "ink";

const CHIP_PALETTE: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  blue:   { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
  green:  { bg: "#ECFDF5", fg: "#047857", border: "#A7F3D0" },
  amber:  { bg: "#FFFBEB", fg: "#B45309", border: "#FDE68A" },
  red:    { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA" },
  rose:   { bg: "#FFF1F2", fg: "#BE123C", border: "#FBCFE8" },
  purple: { bg: "#F5F3FF", fg: "#6D28D9", border: "#DDD6FE" },
  ink:    { bg: "#F1F5F9", fg: "#0F172A", border: "#CBD5E1" },
};

/**
 * Maps the 13 task statuses (9 legacy + 4 Tier-3 additions) to a chip
 * tone. Kept here so every status-changed-flavored template renders
 * the same chip.
 */
export const STATUS_TONE_MAP: Record<string, ChipTone> = {
  dont_know:    "ink",
  not_started:  "amber",
  initiated:    "amber",
  follow_up:    "amber",
  need_help:    "red",
  need_info:    "blue",   // Tier-3
  follow_up_1:  "amber",  // Tier-3
  follow_up_2:  "amber",  // Tier-3
  follow_up_3:  "red",    // Tier-3 — getting urgent
  done:         "green",
  approved:     "green",
  not_approved: "red",
  cancelled:    "rose",
  transferred:  "purple",
};

export const STATUS_LABEL_MAP: Record<string, string> = {
  dont_know:    "Don't Know",
  not_started:  "Not Started",
  initiated:    "Initiated",
  follow_up:    "Follow Up",
  need_help:    "Need Help",
  need_info:    "Need Info",      // Tier-3
  follow_up_1:  "Follow Up 1",    // Tier-3
  follow_up_2:  "Follow Up 2",    // Tier-3
  follow_up_3:  "Follow Up 3",    // Tier-3
  done:         "Done",
  approved:     "Approved",
  not_approved: "Not Approved",
  cancelled:    "Cancelled",
  transferred:  "Transferred",
};

export const PRIORITY_LABEL_MAP: Record<string, string> = {
  imp_urgent:         "Critical",
  imp_not_urgent:     "Important",
  not_imp_urgent:     "Urgent",
  not_imp_not_urgent: "Normal",
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export function taskUrl(siteUrl: string, taskId: string): string {
  return `${stripTrailingSlash(siteUrl)}/tasks/${taskId}`;
}
