"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { MODULE_ORDER, MODULE_THEME, moduleShortcut } from "@/lib/module-theme";
import { canAccessWorkspace, workspaceForPath } from "@/lib/workspaces";

/**
 * SITE-WIDE MODULE FOOTER — every room, one row, on every page.
 *
 * A second way into the ten modules that does not depend on getting back to the
 * hub first. The left rail only ever shows the room you are already inside, so
 * moving between modules meant Hub → card → module; this makes it one click from
 * wherever you are.
 *
 * SOURCE OF TRUTH is `MODULE_ORDER` + `MODULE_THEME` — the same pair the hub
 * grid renders, so a room added there appears here automatically and the label,
 * icon and destination can never disagree between the two surfaces. (Note the
 * destinations are NOT uniform: most rooms enter through `/ws/<id>`, which sets
 * the workspace cookie and forwards to that room's landing, while Billing links
 * straight to `/billing`. Taking `href` from the theme is what keeps that right.)
 *
 * ACCESS: every module is LISTED — a room you cannot enter is still worth
 * knowing exists — but one you cannot access renders as plain text rather than a
 * link, because `(app)/layout.tsx` would bounce the click to /hub and a link
 * that silently sends you somewhere else reads as a bug. This mirrors the hub's
 * locked cards. It is presentation only: the real boundary is the layout gate
 * plus each room's own checks.
 *
 * IN FLOW AT THE END OF THE PAGE, not pinned over it. It rests as a slim strip
 * carrying a grabber; hovering (or tapping) that strip reveals the glass dock,
 * which then stays until the X is pressed. Reserving the strip's height up front
 * is what lets it never cover content: there is nothing below it to cover.
 *
 * A client component — the reveal is stateful. The `access` object is still
 * passed in rather than resolved here so the layout's single `accessFor(me)`
 * call covers both the route gate and this footer, instead of querying twice a
 * page.
 */

export interface ModuleFooterProps {
  access: { departments: string[]; isAdmin: boolean; isSuperAdmin: boolean };
}

export function ModuleFooter({ access }: ModuleFooterProps) {
  const pathname = usePathname();
  const activeWs = workspaceForPath(pathname ?? "/");

  // A HIDDEN DOCK AT THE END OF THE PAGE, revealed by hovering its own strip.
  //
  // It is not a hover menu: once revealed it STAYS revealed, and only the X puts
  // it away. Tying visibility to continued hover would mean holding the cursor
  // inside a 46px strip while reading the labels, which is exactly the fiddly
  // behaviour this replaces.
  const [visible, setVisible] = React.useState(false);

  // Escape closes it, matching every other dismissible overlay in the app.
  React.useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  return (
    <div
      // THE REVEAL STRIP — the end of the page, and the dock's own hover target.
      //
      // The dock used to be a STICKY floating bar pinned 18px off the viewport
      // bottom, summoned by driving the pointer into the screen edge. Pinned, it
      // rode over the page: on a long table it sat on top of a row, which is the
      // one thing a navigation aid must never do.
      //
      // So it is now IN FLOW at the end of the page. `mt-auto` (the page column
      // is a full-height flex column — see ChromeShell) drops it to the bottom of
      // the viewport on a short page and simply follows the content on a long
      // one. `mx-auto` centres it in the CONTENT rather than the viewport, so it
      // tracks the rail collapsing, widening or disappearing for free — the rail
      // is 74px collapsed and 212/228/288px expanded depending on the module, so
      // no constant offset could ever have been right.
      //
      // Hovering ANYWHERE on this strip reveals the dock, and `onClick` does the
      // same for touch, where `mouseenter` never fires. Moving away does NOT
      // hide it again — only the X does. Requiring sustained hover would mean
      // holding the cursor inside a 46px band while reading ten labels.
      onMouseEnter={() => setVisible(true)}
      onClick={() => setVisible(true)}
      className="module-footer mt-auto w-full pt-6 print:hidden"
    >
      {/* Fixed-height band: the dock is absolutely positioned inside it, so the
          space is reserved whether or not the dock is shown and revealing it
          shifts nothing. Being the last thing on the page, that reserved band
          costs no content — which is what makes "never covers anything" a
          structural property here rather than a z-index negotiation. */}
      <div className="relative mx-auto flex h-[52px] w-full items-center justify-center px-3">
        {/* Resting affordance — a grabber, so an invisible strip is still
            discoverable. It fades out as the dock fades in. */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-1 w-9 rounded-full transition-opacity duration-200 motion-reduce:transition-none"
          style={{
            opacity: visible ? 0 : 1,
            background: "rgba(15,23,42,0.14)",
          }}
        />
      <nav
        aria-label="All modules"
        // Hidden state is inert as well as invisible: `inert` drops it out of the
        // tab order and the accessibility tree, so a keyboard user never lands on
        // ten invisible links. Revealing it restores both. It sits on the nav,
        // not the wrapper — an inert wrapper would swallow its own hover.
        inert={!visible}
        // `max-w` + `overflow-x-auto` keep it from ever exceeding its column: on
        // a narrow screen the strip scrolls sideways inside its own glass rather
        // than pushing the page wider.
        className="absolute flex max-w-[calc(100%-24px)] items-center gap-x-0.5 overflow-x-auto rounded-[18px] px-2 py-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
        style={{
          opacity: visible ? 1 : 0,
          // A short lift rather than the old slide-off-screen: in flow there is
          // no viewport edge to hide behind, and a long travel would read as the
          // bar arriving from somewhere else on the page.
          transform: visible ? "translateY(0)" : "translateY(6px)",
          // Belt and braces with `inert`: an invisible dock must not eat a click
          // aimed at whatever sits behind it.
          pointerEvents: visible ? "auto" : "none",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 6px 24px -8px rgba(15,23,42,0.18), 0 1px 2px rgba(15,23,42,0.06)",
          scrollbarWidth: "none",
        }}
      >
        {MODULE_ORDER.map((id, i) => {
          const m = MODULE_THEME[id];
          const allowed = canAccessWorkspace(id, access);
          const Icon = m.Icon;
          const shortcut = moduleShortcut(i);
          const active = activeWs === id;

          const inner = (
            <>
              <Icon size={15} strokeWidth={2.3} aria-hidden />
              {/* The same digit the hub badges show, so the shortcut is learnable
                  from whichever surface you happen to be looking at. Dimmer than
                  the label — a hint, not a heading — and aria-hidden so the row
                  does not read as "one W M S two Goals".
                  The ⌃ prefix is not decoration: the digit alone no longer
                  navigates (it was colliding with typing), so a bare "1" here
                  would now be advertising a shortcut that does nothing. */}
              {shortcut && (
                <span aria-hidden className="tabular-nums opacity-55">
                  ⌃{shortcut}
                </span>
              )}
              <span className="whitespace-nowrap">{m.label}</span>
            </>
          );

          // Locked: no link, no hover affordance, and said out loud for screen
          // readers rather than left as an unexplained dead label.
          if (!allowed) {
            return (
              <span
                key={id}
                title={`${m.label} — you don't have access to this module`}
                className="inline-flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold"
                style={{ color: "rgba(15,23,42,0.30)" }}
              >
                {inner}
                <span className="sr-only"> (no access)</span>
              </span>
            );
          }

          return (
            <Link
              key={id}
              href={m.href}
              title={shortcut ? `${m.label} — Ctrl+${shortcut} (or Alt+${shortcut})` : m.label}
              aria-current={active ? "page" : undefined}
              // Resting state is a dark neutral so ten labels do not glare on the
              // light glass; the module's own accent appears on hover/focus, and
              // stays on for the room you are already in.
              className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
              style={{
                ["--mod-accent" as string]: m.accent,
                // ACTIVE is a tint plus the accent on the text — deliberately not
                // a filled pill, which at this size reads as a selected tab in a
                // toolbar rather than a hint of where you are.
                color: active ? m.accent : "rgba(15,23,42,0.62)",
                ...(active
                  ? { background: `color-mix(in srgb, ${m.accent} 10%, transparent)` }
                  : null),
              }}
            >
              {inner}
            </Link>
          );
        })}

        {/* Dismiss. Separated by a hairline so it reads as a control on the dock
            rather than an eleventh module. The dock can always be summoned again
            by hovering the strip, so this hides rather than disables anything.
            `stopPropagation` because the wrapper's own onClick re-reveals —
            without it the X would hide and instantly show again. */}
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[rgba(15,23,42,0.12)]" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
          }}
          aria-label="Hide module bar"
          title="Hide — hover the strip at the end of the page to bring it back"
          className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 outline-none transition-colors hover:bg-[rgba(15,23,42,0.06)] focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.35)]"
          style={{ color: "rgba(15,23,42,0.45)" }}
        >
          <X size={14} strokeWidth={2.6} />
        </button>
      </nav>
      </div>
    </div>
  );
}
