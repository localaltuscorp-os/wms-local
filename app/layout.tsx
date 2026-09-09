import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AppToaster } from "@/components/ui/sonner-toaster";
import { Providers } from "@/components/providers";
import { DisplayScaleProvider } from "@/components/layout/display-scale-provider";
import { RegisterSW } from "@/components/pwa/register-sw";
import { RouteProgress } from "@/components/layout/route-progress";
import { SingleWindowGuard } from "@/components/system/single-window-guard";
import { getCurrentEmployee } from "@/lib/auth/current";
import { accentVars, resolveAccent } from "@/lib/appearance";

/**
 * Fonts are SELF-HOSTED from `app/fonts/*.woff2` via `next/font/local`.
 *
 * They used to come from `next/font/google`, which downloads the files from
 * fonts.gstatic.com AT BUILD TIME. That makes every deploy depend on Google
 * being reachable from the build machine, and when it is not the build does not
 * degrade — it FAILS: `NextFontError: Failed to fetch 'JetBrains Mono' from
 * Google Fonts` after three retries, taking the whole deployment down. That is
 * exactly what happened on commit b50e9e2.
 *
 * `next/font/local` reads the bytes from the repo, so the build is hermetic and
 * no font can ever break a deploy again. Runtime behaviour is unchanged: the
 * Google loader already self-hosted the files it downloaded, so the browser was
 * never talking to Google either way — only the build was.
 *
 * Each file is the LATIN subset of the family's VARIABLE font, so one file spans
 * the whole weight range the design uses (that is why `weight` is a range like
 * "300 900" rather than a list). Total cost: ~152 KB for all four.
 *
 * To refresh or add a weight axis, re-download the latin `src` from
 * `https://fonts.googleapis.com/css2?family=<Family>:wght@<min>..<max>` with a
 * browser User-Agent (the API serves woff2 only to modern UAs) and drop the file
 * in `app/fonts/`. Do NOT reintroduce `next/font/google`.
 */

const roboto = localFont({
  src: "./fonts/roboto-latin.woff2",
  variable: "--font-roboto",
  weight: "300 900",
  display: "swap",
});

// Display font for the KPI hero numerals and section headlines. Variable
// weight + optical sizing means it holds up at 160px without looking
// stretched. Picked over Inter / system-ui so the dashboard has a
// recognisable typographic voice instead of generic-sans aesthetics.
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  variable: "--font-display",
  weight: "300 800",
  display: "swap",
});

// Monospace voice for eyebrow labels + small caps in the holographic
// strip. Pairs against Bricolage's geometric curves for tension.
// Uses --font-mono-display (not --font-mono) so the existing @theme
// fallback chain stays intact for any code path that wants generic
// monospace.
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-mono-display",
  weight: "400 700",
  display: "swap",
});

// Editorial serif for the Weekly Goals board (member names, section title,
// goal titles only — body text stays on the existing sans). Exposed as
// --font-editorial; consumed inline by the weekly-goals components.
const fraunces = localFont({
  src: "./fonts/fraunces-latin.woff2",
  variable: "--font-editorial",
  weight: "400 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Altus Corp — Work Management Dashboard",
  description: "Altus Corp work management dashboard",
  metadataBase: new URL("https://altus-corp-dashboard.vercel.app"),
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom up to 5x for accessibility; never disable user scaling.
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Profile v2 — stamp density + accent from the user's prefs. Theme is
  // intentionally light-only (no dark mode); the `theme` column on
  // employees is kept but unused.
  // Defense in depth: there is NO error boundary above the root layout, so a
  // genuine DB failure here would crash the entire app shell. `getCurrentEmployee`
  // already self-heals a stale connection via withRetry; if it STILL throws we
  // fall back to null → default prefs render instead of a hard crash. The (app)
  // layout's requireUser still enforces auth/redirect downstream.
  const me = await getCurrentEmployee().catch(() => null);
  const density = me?.density ?? "cozy";
  // Map the user's accent onto the brand accent CSS variables the whole app
  // consumes (--color-altus-red*, --vp-cyan*). For the default red this
  // reproduces globals.css exactly, so default users see no change.
  const htmlStyle = accentVars(resolveAccent(me?.accent)) as React.CSSProperties;

  return (
    <html
      lang="en"
      className={`${roboto.variable} ${bricolage.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}
      data-density={density}
      style={htmlStyle}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning is scoped to <html>/<body> because
          common browser extensions (Grammarly, password managers, ad-blockers)
          decorate these elements with bookkeeping attributes like
          `__processed_<uuid>__` before React hydrates. The diff is in
          attributes only, never in our subtree, so suppressing here is
          safe and React's normal hydration warnings still apply
          everywhere else. */}
      <body suppressHydrationWarning>
        {/* Display-scale's geometric `zoom` was removed — a non-unity zoom on
            <html> double-applies to Radix/floating-ui portaled panels and threw
            every dropdown/popover off toward a corner. This inline script now
            only CLEARS any stale zoom a previous build may have left, pre-paint,
            so an open tab self-heals on next load. See DisplayScaleProvider. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{document.documentElement.style.zoom='';}catch(e){}})();",
          }}
        />
        <DisplayScaleProvider />
        {/* Global navigation progress bar — fires on every in-app link click
            across ALL route groups (app, admin, auth). Wrapped in Suspense
            because it reads useSearchParams. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {/* NuqsAdapter wires nuqs's useQueryState into the Next App Router
            so URL-as-state hooks (settings tabs, filter bars, etc.) work.
            Required by nuqs v2+ — without it any client component calling
            useQueryState throws "nuqs requires an adapter". */}
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
        {/* Single-window lock (WhatsApp-Web style) — disabled per request so
            goal links can open in a new tab without the "in another window"
            takeover prompt interrupting either tab. */}
        <SingleWindowGuard enabled={false} />
        <AppToaster />
        <RegisterSW />
        {/* Phase 0.3 — Vercel Speed Insights. Auto-no-ops outside Vercel
            (no env vars needed); on Vercel it records real-user Core Web
            Vitals per route, accessible from the project dashboard. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
