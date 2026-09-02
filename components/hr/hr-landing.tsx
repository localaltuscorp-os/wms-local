"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  PartyPopper,
  LifeBuoy,
  Sparkles,
  LayoutGrid,
  X,
  IdCard,
  Inbox,
  ClipboardList,
  FileText,
  Plus,
  Target,
  Megaphone,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { HR_STAGES, hrItemHref, type HrStage } from "@/lib/hr/lifecycle";

// Loaded on demand (keeps the candidate-actions graph out of the /hr bundle).
const IntakeChooserPopup = dynamic(
  () => import("@/components/hr/candidate/intake-chooser-popup").then((m) => m.IntakeChooserPopup),
  { ssr: false },
);

// Loaded on demand — keeps the (sizeable) policy content out of the initial /hr
// bundle. Opened from Pre-Joining → "All Policies Sign".
const AllPoliciesPopup = dynamic(
  () => import("@/components/hr/policies/all-policies-popup").then((m) => m.AllPoliciesPopup),
  { ssr: false },
);

/**
 * HR front door — a premium, light-theme, animated welcome. A "Welcome to HR"
 * hero over a soft aurora canvas, then the employee journey as a card deck
 * (5 stages + Holiday List + Help Desk) that springs in on load and lifts a
 * card on hover.
 *
 * Clicking a STAGE card opens a quick pop-up (not a page) that lets you pick a
 * surface inside that stage — e.g. Pre-Interview → Basic Details · First
 * Assessment · Management Assessment. The utility cards (Holiday, Help Desk)
 * still navigate straight through.
 *
 * NOTE: all motion here is pure CSS (no framer-motion). The `motion/react`
 * barrel takes ~49s to compile cold in dev, which was hanging /hr.
 */

interface Card {
  slug: string;
  title: string;
  Icon: LucideIcon;
  stage?: HrStage; // present → clicking opens the stage pop-up instead of navigating
  popup?: "help-desk" | "policies"; // present → clicking opens that quick-popup
}

// Every card shares the Altus red + black identity (no rainbow of hues).
// The employee lifecycle stages, then the utility cards. "Help Desk" opens a
// quick-popup (matching the stage pop-ups) and "HR Record" — the per-person hub
// and the home for the Letters library — sits right beside it.
const CARDS: Card[] = [
  ...HR_STAGES.map((s) => ({ slug: `/hr/${s.slug}`, title: s.title, Icon: s.Icon, stage: s })),
  { slug: "/hr/holidays", title: "Holiday List", Icon: PartyPopper },
  // Policies — a first-class card. Opens the "All Policies" popup where anyone
  // can read AND sign each firm policy themselves (self-attested e-sign today,
  // DigiLocker once keyed). Visible to EVERY employee, not just HR staff.
  { slug: "/policies", title: "Policies", Icon: ScrollText, popup: "policies" as const },
  { slug: "/support", title: "Help Desk", Icon: LifeBuoy, popup: "help-desk" as const },
  { slug: "/hr/record", title: "HR Record", Icon: IdCard },
  { slug: "/hr/kpi", title: "KPI Management", Icon: Target },
  { slug: "/communications", title: "Enterprise Communications", Icon: Megaphone },
  // Saved form submissions (staff-only view of everyone's). This MUST live on
  // this deck: the HR module is rail-less (see the Help Desk note below), so a
  // sidebar entry is never shown and this grid is the only way into the surface.
  // ("My Filled Forms" was removed from the HR home per Sir.)
  { slug: "/hr/all-forms", title: "All Filled Forms", Icon: ClipboardList },
  // The viewer's OWN payslips. Staff see the same self-scoped page as everyone
  // else — it reads the signed-in employee's rows and takes no employee
  // parameter, so this is never a door into someone else's pay. The admin
  // Salary module lives in the Accounts room and stays finance-gated.
  { slug: "/hr/salary-slip", title: "Salary Slip", Icon: FileText },
];

// The limited deck a NORMAL employee sees: only their own HR record (the /portal
// self-service — NOT the staff-only /hr/record hub), the Holiday List, and the
// Help Desk. No stages, no intake/policies pop-ups. Kept to three intentional,
// centred cards.
const LIMITED_CARDS: Card[] = [
  { slug: "/hr/holidays", title: "Holiday List", Icon: PartyPopper },
  // Policies are for EVERYONE — a normal employee must be able to read + sign
  // every firm policy. Same "All Policies" popup as the staff deck.
  { slug: "/policies", title: "Policies", Icon: ScrollText, popup: "policies" as const },
  { slug: "/support", title: "Help Desk", Icon: LifeBuoy, popup: "help-desk" as const },
  { slug: "/portal", title: "My HR Record", Icon: IdCard },
  // ("My Filled Forms" was removed from this deck per Sir; the staff-only
  // "All Filled Forms" was already deliberately absent here.)
  // Their own payslips — the surface this deck most needs to offer a normal
  // employee. Self-scoped by construction: the page reads the signed-in
  // employee's own rows and takes no employee parameter.
  { slug: "/hr/salary-slip", title: "Salary Slip", Icon: FileText },
];

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

// Rendered as a plain static <style> (NOT styled-jsx). styled-jsx's dynamic
// transform (triggered by ${} interpolation) blew up the webpack compile of this
// component into a multi-minute hang; a static string sidesteps the transform.
const LAND_CSS = `
  .hr-land { background: #ffffff; }
  .hr-aurora { position: absolute; border-radius: 9999px; filter: blur(70px); opacity: 0.09; }
  .hr-aurora-a { width: 620px; height: 620px; left: -140px; top: -180px; background: radial-gradient(circle at 30% 30%, rgba(225,6,0,0.28), transparent 70%); animation: hrFloatA 18s ease-in-out infinite; }
  .hr-aurora-b { width: 560px; height: 560px; right: -120px; top: -120px; background: radial-gradient(circle at 60% 40%, rgba(244,114,182,0.30), transparent 70%); animation: hrFloatB 22s ease-in-out infinite; }
  .hr-aurora-c { width: 720px; height: 520px; left: 40%; top: 220px; background: radial-gradient(circle at 50% 50%, rgba(245,158,11,0.18), transparent 70%); animation: hrFloatA 26s ease-in-out infinite reverse; }
  .hr-grain { opacity: 0.5; background-image: radial-gradient(rgba(15,23,42,0.035) 1px, transparent 1px); background-size: 4px 4px; }
  .hr-shine { background: linear-gradient(100deg, ${ACCENT} 0%, ${ACCENT_DEEP} 30%, #ff5a54 55%, ${ACCENT} 100%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: hrShine 5s linear infinite; }
  .hr-in { animation: hrFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .hr-card-in { animation: hrCardIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes hrShine { to { background-position: 220% 0; } }
  @keyframes hrFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes hrCardIn { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes hrFloatA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,26px) scale(1.06); } }
  @keyframes hrFloatB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-28px,20px) scale(1.08); } }
  @keyframes hrOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes hrPopIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (prefers-reduced-motion: reduce) { .hr-aurora, .hr-shine, .hr-in, .hr-card-in { animation: none !important; } }
`;

export function HrLanding({ isHrStaff }: { isHrStaff: boolean }) {
  const [openStage, setOpenStage] = React.useState<HrStage | null>(null);
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [policiesOpen, setPoliciesOpen] = React.useState(false);
  const [helpDeskOpen, setHelpDeskOpen] = React.useState(false);

  // Re-open a stage's pop-up when we return via /hr?open=<slug> (the "Back to
  // Pre-Interview" button on the Basic Details form points here), and open the
  // All-Policies pop-up when reached via /hr?policies=1 (the "All Policies Sign"
  // link from the Pre-Joining sidebar / stage page). Staff-only — a normal
  // employee never gets these surfaces even via a hand-crafted URL.
  React.useEffect(() => {
    if (!isHrStaff) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("policies")) setPoliciesOpen(true);
    const slug = params.get("open");
    if (!slug) return;
    const s = HR_STAGES.find((x) => x.slug === slug);
    if (s) setOpenStage(s);
  }, [isHrStaff]);

  const cards = isHrStaff ? CARDS : LIMITED_CARDS;

  return (
    <div className="hr-land relative flex h-[calc(100dvh-64px)] w-full flex-col overflow-hidden max-md:h-auto max-md:min-h-[calc(100dvh-64px)] max-md:overflow-visible">
      {/* Aurora canvas */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hr-aurora hr-aurora-a" />
        <div className="hr-aurora hr-aurora-b" />
        <div className="hr-aurora hr-aurora-c" />
        <div className="hr-grain absolute inset-0" />
      </div>

      {/* Back to Hub — top-left (the rail is hidden on this landing) */}
      <Link
        href={"/hub" as Route}
        className="group absolute left-6 top-5 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:left-4 max-md:top-4"
        style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
      >
        <LayoutGrid size={15} strokeWidth={2.5} className="transition-transform group-hover:-rotate-6" />
        Back to Hub
      </Link>

      {/* Content — vertically centred so the whole page holds still (no scroll) */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-1 flex-col items-center justify-center px-8 py-8 text-center max-md:px-5 max-md:py-10">
        {/* Hero */}
        <span
          className="hr-in inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: ACCENT_DEEP, background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 22%, transparent)" }}
        >
          <Sparkles size={13} strokeWidth={2.6} /> Altus · Human Resources
        </span>

        <h1
          className="hr-in mx-auto mt-4 max-w-[16ch] text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 4.2vw, 52px)", letterSpacing: "-0.035em", lineHeight: 1.0, animationDelay: "60ms" }}
        >
          Welcome to{" "}
          <span className="hr-shine relative whitespace-nowrap">HR</span>
        </h1>

        {/* Cards — one wrapping deck: staff 10 → 5×2, a normal employee 3 → centred. */}
        <div className="mt-8 flex w-full max-w-[1050px] flex-wrap justify-center gap-5 max-md:mt-6 max-md:gap-4">
          {cards.map((c, idx) => (
            <div key={c.slug} className="hr-card-in" style={{ animationDelay: `${120 + idx * 50}ms` }}>
              <DeckCard
                card={c}
                onOpen={
                  c.stage
                    ? () => setOpenStage(c.stage!)
                    : c.popup === "help-desk"
                      ? () => setHelpDeskOpen(true)
                      : c.popup === "policies"
                        ? () => setPoliciesOpen(true)
                        : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Stage + intake pop-ups are STAFF-ONLY. The Policies and Help Desk
          pop-ups are open to EVERYONE — every employee can read + sign policies. */}
      {isHrStaff && openStage && (
        <StagePopup
          stage={openStage}
          onClose={() => setOpenStage(null)}
          onOpenChooser={() => setChooserOpen(true)}
          onOpenPolicies={() => setPoliciesOpen(true)}
        />
      )}
      {isHrStaff && chooserOpen && <IntakeChooserPopup onClose={() => setChooserOpen(false)} />}
      <AllPoliciesPopup open={policiesOpen} onClose={() => setPoliciesOpen(false)} />
      {helpDeskOpen && <HelpDeskPopup onClose={() => setHelpDeskOpen(false)} />}

      <style dangerouslySetInnerHTML={{ __html: LAND_CSS }} />
    </div>
  );
}

function DeckCard({ card, onOpen }: { card: Card; onOpen?: () => void }) {
  const RED = "#E10600";
  const INK = "#18181b";
  const inner = (
    <>
      {/* red highlight glow on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${RED} 16%, transparent), transparent 62%)` }}
      />
      <div className="flex flex-1 flex-col items-center justify-center px-3.5 pt-4 text-center">
        <h3
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "-0.015em", lineHeight: 1.12, color: INK }}
        >
          {card.title}
        </h3>
      </div>
      <span className="mt-auto flex items-center justify-between px-4 pb-3.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: INK }}>
          Enter
        </span>
        <ArrowUpRight size={17} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: RED }} />
      </span>
    </>
  );
  const cls = "hr-deck group relative flex flex-col overflow-hidden rounded-[16px] bg-white text-left transition-transform duration-200 hover:-translate-y-2";
  const style: React.CSSProperties = {
    width: 194,
    minHeight: 122,
    border: "2px solid color-mix(in srgb, #E10600 55%, white)",
    boxShadow: "0 10px 26px -14px rgba(24,24,27,0.20), 0 2px 6px -2px rgba(24,24,27,0.10)",
  };

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={cls} style={style}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={card.slug as Route} className={cls} style={style}>
      {inner}
    </Link>
  );
}

function StagePopup({ stage, onClose, onOpenChooser, onOpenPolicies }: { stage: HrStage; onClose: () => void; onOpenChooser: () => void; onOpenPolicies: () => void }) {
  const RED = "#E10600";
  const RED_DEEP = "#A80400";

  // Close on Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)", animation: "hrOverlayIn 0.18s ease-out both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[540px] overflow-hidden rounded-[22px] bg-white"
        style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)", border: "1px solid color-mix(in srgb, #E10600 22%, white)", animation: "hrPopIn 0.24s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {/* header */}
        <div className="relative px-6 pt-6 pb-4" style={{ background: "linear-gradient(180deg, color-mix(in srgb, #E10600 7%, white), #ffffff)" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            Altus · {stage.title}
          </span>
          <h2
            className="mt-2.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.05 }}
          >
            Choose a Step
          </h2>
        </div>

        {/* options */}
        <div className="grid gap-2.5 p-4 pt-3">
          {stage.items.map((item, i) => {
            const Icon = item.Icon;
            const href = hrItemHref(stage.slug, item);
            const cls =
              "group flex items-center gap-3.5 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5 text-left transition-all hover:border-hairline-strong hover:shadow-md";
            const inner = (
              <>
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-black text-white"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink-strong">
                    <Icon size={15} strokeWidth={2.2} style={{ color: RED_DEEP }} /> {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] font-medium text-ink-muted">{item.blurb}</span>
                </span>
                <ArrowUpRight size={17} className="shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </>
            );
            // Candidate Interview Form opens the New/Continue chooser POP-UP.
            if (href === "/hr/intake") {
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => { onClose(); onOpenChooser(); }}
                  className={`w-full ${cls}`}
                >
                  {inner}
                </button>
              );
            }
            // "All Policies Sign" opens the All-Policies POP-UP (read + sign each
            // policy on day one) rather than navigating to a route.
            if (item.slug === "all-policies-signatory") {
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => { onClose(); onOpenPolicies(); }}
                  className={`w-full ${cls}`}
                >
                  {inner}
                </button>
              );
            }
            return (
              <Link key={item.slug} href={href as Route} onClick={onClose} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELP DESK — a quick-popup of option cards (same pattern as the stage pop-ups),
// so the Help Desk experience is rail-less like the rest of the HR module.
// ─────────────────────────────────────────────────────────────────────────────

interface HelpDeskOption {
  slug: string;
  label: string;
  blurb: string;
  href: string;
  Icon: LucideIcon;
}

const HELP_DESK_OPTIONS: HelpDeskOption[] = [
  { slug: "raise", label: "Raise a Ticket", blurb: "Ask HR for help — a question, request or escalation.", href: "/support/new", Icon: Plus },
  { slug: "my-requests", label: "My Requests", blurb: "Track everything you've raised and its status.", href: "/support", Icon: Inbox },
];

function HelpDeskPopup({ onClose }: { onClose: () => void }) {
  const RED = "#E10600";
  const RED_DEEP = "#A80400";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)", animation: "hrOverlayIn 0.18s ease-out both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[540px] overflow-hidden rounded-[22px] bg-white"
        style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)", border: "1px solid color-mix(in srgb, #E10600 22%, white)", animation: "hrPopIn 0.24s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="relative px-6 pt-6 pb-4" style={{ background: "linear-gradient(180deg, color-mix(in srgb, #E10600 7%, white), #ffffff)" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <LifeBuoy size={12} strokeWidth={2.6} /> Altus · Help Desk
          </span>
          <h2
            className="mt-2.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.05 }}
          >
            Choose a Step
          </h2>
          <p className="mt-1 max-w-[44ch] text-[13.5px] font-medium leading-snug text-ink-muted">
            Get help from the HR desk — questions, requests and escalations, all tracked in one place.
          </p>
        </div>

        <div className="grid gap-2.5 p-4 pt-3">
          {HELP_DESK_OPTIONS.map((item, i) => {
            const Icon = item.Icon;
            return (
              <Link
                key={item.slug}
                href={item.href as Route}
                onClick={onClose}
                className="group flex items-center gap-3.5 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5 text-left transition-all hover:border-hairline-strong hover:shadow-md"
              >
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-black text-white"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink-strong">
                    <Icon size={15} strokeWidth={2.2} style={{ color: RED_DEEP }} /> {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] font-medium text-ink-muted">{item.blurb}</span>
                </span>
                <ArrowUpRight size={17} className="shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
