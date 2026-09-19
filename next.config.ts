import path from "node:path";
import type { NextConfig } from "next";

// The @sparticuz/chromium binary pack (pnpm-hoisted, any version) — traced into
// the rich-letter PDF routes so executablePath() finds it at runtime on Vercel.
const CHROMIUM_BIN =
  "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**";

// Security response headers (applied to every route). The CSP is deliberately
// BALANCED: strict on the structural directives that stop clickjacking / base-tag
// / form-hijack / plugin embeds (frame-ancestors, base-uri, form-action,
// object-src), but permissive on script/style/connect where the app legitimately
// needs it — inline <style>/style= are used app-wide, and it talks to Firebase +
// Supabase (+ realtime wss) over https. `unsafe-inline`/`unsafe-eval` are kept so
// a live app used by real staff doesn't break; a nonce/hash-based script CSP is a
// separate hardening pass. Stored-HTML XSS is closed at the source (sanitised on
// save) rather than relying on CSP alone.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // va.vercel-scripts.com is named because app/layout.tsx renders
  // <SpeedInsights />, whose script is served from there. Without it the policy
  // blocked the very script the app asks for, logging a CSP violation on every
  // page load. Named explicitly rather than widening script-src to https:.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // The app USES camera (attendance selfie / work camera), microphone and
  // geolocation (geofence) — allow those to self; deny the rest by default.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  /**
   * WHERE THE BUILD OUTPUT GOES — overridable, so DUMMY MODE can run BESIDE the
   * real dev server instead of instead of it.
   *
   * Next refuses to start a second `next dev` from the same directory ("Another
   * next dev server is already running"), because both would fight over
   * `.next/`. That made the dummy sandbox an either/or: stop the server pointed
   * at the real database, or do not look at dummy data. Giving the sandbox its
   * own output directory lets both run — :3000 on the real data, :3002 on
   * PGlite (see `pnpm dev:dummy`).
   *
   * Defaults to `.next`, so every existing build and deploy is unchanged.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // THIS DIRECTORY IS THE WORKSPACE, full stop.
  //
  // Turbopack infers the root by walking UP for a lockfile, and there is a stray
  // 84-byte `package-lock.json` sitting in the Windows home folder
  // (C:\Users\<you>\package-lock.json, no packages in it). It outranked our own
  // pnpm-lock.yaml, so every `next dev` opened with "Next.js inferred your
  // workspace root, but it may not be correct" and then rooted the module graph
  // at the HOME DIRECTORY — watching the entire user profile for changes.
  //
  // That is not just noise: a file-watch tree that large invalidates unreliably,
  // which is how an edit to lib/ecos/queries.ts came back as "Export
  // nextPopupBroadcastForEmployee doesn't exist in target module" for an export
  // that plainly does. Pinning the root keeps the graph inside the app.
  turbopack: {
    root: path.join(__dirname),
  },
  // Server Actions receive multipart posts carrying file uploads (the onboarding
  // form alone requires selfie / Aadhaar / PAN / cancelled-cheque attachments). Next's
  // DEFAULT Server Action body cap is 1 MB, which silently rejected every onboarding
  // submit before the action ran — yet the form allows up to 25 MB per file (MAX_BYTES).
  // Raise the framework cap to match. NOTE: the HOST may still impose its own request-
  // body limit (Vercel serverless functions cap around 4.5 MB); files above the host
  // limit need a direct-to-storage upload, not a Server Action post.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // THE VERCEL BUILD RAN OUT OF MEMORY (19 Sep). On the 2-core / 8 GB build
    // machine the webpack compile stalled after "Compiled with warnings" and
    // was killed at Vercel's 45-minute limit, twice, on code that had built
    // in 7 minutes an hour earlier. Trades a little build speed for a lower
    // peak heap. Paired with the heap size in package.json's build script.
    webpackMemoryOptimizations: true,
  },
  /**
   * TYPED ROUTES ARE OFF — the app outgrew them.
   *
   * `typedRoutes` makes `Route` a template-literal union of every route in the
   * app. This codebase now has enough routes that TypeScript gives up computing
   * it, and the production build died with:
   *
   *   app/(app)/productivity/page.tsx:57
   *   Type error: Expression produces a union type that is too complex to represent.
   *
   * That is a CEILING, not a bug at the reported site: the union simply exceeded
   * what the checker will materialise, and the first expression to force its
   * resolution is where it surfaces. Fixing that one line moves the failure to
   * one of the other 572 `as Route` casts in the tree, and the next route anyone
   * adds re-breaks whichever site is unlucky.
   *
   * The safety it bought was already largely notional: 573 explicit `as Route`
   * casts opt out of the checking, because most hrefs here are built at runtime
   * from query strings and ids, which a literal union cannot describe anyway. So
   * this trades a guarantee the code had mostly stopped relying on for a build
   * that does not fall over on route count.
   *
   * `Route` stays exported and every existing cast keeps compiling — it just
   * resolves to a string type now, so this is a one-line change and not a
   * 573-file rewrite.
   *
   * TO REVISIT: if the route surface shrinks materially, turning this back on is
   * a one-word change. Verify it with a full `pnpm build` and NOT with
   * `tsc --noEmit`: the route union lives in generated `.next/types`, and the
   * dev server (Turbopack) writes a different set from `next build` (webpack).
   * A local `tsc --noEmit` against dev-generated types passed clean while the
   * production build failed on exactly this — which is how it reached main.
   */
  typedRoutes: false,
  devIndicators: false,
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  /**
   * KEEP THE DUMMY-MODE DATABASE OUT OF PRODUCTION FUNCTIONS.
   *
   * ── THE MEASUREMENT ──────────────────────────────────────────────────────
   * On 2026-09-15 Vercel reported Functions Storage at 10.6 GB against a 10 GB
   * allowance. Summing every function's traced files (.next/server/**\/*.nft.json)
   * found 10.30 GB across 431 functions, and 7.14 GB of that — 69% — was ONE
   * devDependency:
   *
   *   @electric-sql/pglite   7.14 GB   in 426 of 431 functions   17.2 MB each
   *
   * ── WHY IT WAS THERE, THOUGH EVERY PRECAUTION WAS ALREADY TAKEN ─────────
   * PGlite is the local fixture database (DUMMY_MODE, port 3002). It is a
   * devDependency, it is in `serverExternalPackages` below, and `dummyDb()` in
   * lib/db/index.ts `require()`s it at CALL time with a comment saying the real
   * database path must never pay for it. All correct, and none of it helps:
   *
   *   · `serverExternalPackages` stops it being BUNDLED. It does not stop it
   *     being TRACED — that is the point of the option, to keep it a plain
   *     runtime require out of node_modules.
   *   · A call-time `require()` with a LITERAL string is still statically
   *     analysable, so nft follows it exactly as it would an import.
   *
   * So every function that touched `lib/db` — all 426 of them — shipped a copy
   * of PostgreSQL-compiled-to-WASM that production can never execute.
   *
   * ── WHY EXCLUDING IS SAFE ───────────────────────────────────────────────
   * `dummyDb()` is reached only when DUMMY_MODE=true, which is the local
   * sandbox and never a deployment. If it somehow ran on Vercel it would fail
   * at the require rather than misbehave — a loud failure in a mode that is not
   * supposed to exist there, which is the right way round.
   *
   * ── WHY THIS IS FIXED IN lib/db/index.ts AND NOT WITH AN EXCLUDE HERE ───
   * `outputFileTracingExcludes` was tried and then abandoned, for a reason
   * worth recording because it will waste the next person's afternoon too.
   *
   * DO NOT TRUST A LOCAL `.nft.json` MEASUREMENT. Three builds of essentially
   * the same tree gave 10.30 GB, then 1.95 GB, then 1.95 GB again — and the
   * two small ones traced NO node_modules AT ALL: zero for `@sparticuz/
   * chromium`, zero for `firebase-admin`, zero for `postgres`. An app missing
   * its own database driver cannot run, so those traces are simply incomplete,
   * not a saving. (The full one came from a build that reused an existing
   * `.next`; the empty ones followed `rm -rf .next`.) The exclude was blamed
   * for that and was innocent — the same emptiness appears with no exclude
   * configured at all.
   *
   * The one trustworthy local measurement is the complete trace, and it is
   * where the 7.14 GB above comes from: internally consistent, with chromium
   * in exactly the four routes configured for it and firebase-admin in 92.
   *
   * The fix lives at the source instead: `dummyDb()` requires PGlite through a
   * VARIABLE specifier, which a static analyser cannot resolve and so cannot
   * follow. Chosen over an exclude because it is precise BY CONSTRUCTION —
   * there is no glob to get wrong and no way for it to catch another package —
   * and because it cannot break anything even if it turns out to save nothing:
   * production never calls `dummyDb()`, and Node resolves a variable specifier
   * perfectly well at runtime for the local sandbox that does.
   *
   * VERIFY ON VERCEL, NOT HERE: Usage → Functions Storage, after a deploy.
   */
  // Ship the hand-crafted Goals bulk-import workbook INTO the template route's
  // serverless function bundle (public/ assets are CDN-served and NOT guaranteed
  // to be on the function filesystem, so a bare readFile would 500 in prod).
  outputFileTracingIncludes: {
    "/goals/template.xlsx": ["./public/templates/Altus-Goals-Template.xlsx"],
    // The Upload Master download route serves the same built-in Goals workbook
    // (via lib/templates/goals.ts) without module access, so it needs the file
    // traced into its own function too.
    "/admin/upload-master/download/[key]": ["./public/templates/Altus-Goals-Template.xlsx"],
    // @sparticuz/chromium's binary lives in its `bin/` dir and is unpacked at
    // RUNTIME by executablePath() — nothing statically imports it, so Vercel's
    // file-tracing drops it from the function ("input directory …/bin does not
    // exist"). Force-include it into every route that renders a RICH letter PDF
    // with headless Chromium. The @* matches whatever pnpm-hoisted version is
    // installed (currently @sparticuz/chromium@149).
    // Rich letters print on headless Chromium, which ships NO fonts — the
    // self-hosted letter fonts (public/letter-fonts/*.woff2) are read off disk
    // and base64-embedded per render (render-rich.ts). Like the chromium binary,
    // these public/ assets are CDN-served and NOT guaranteed to be on the
    // function filesystem, so trace the whole dir into each PDF route.
    // BOTH renderers read the letterhead off disk and 500-degrade if it's not on
    // the function FS: the pdfkit (structured) renderer embeds the baked strip
    // public/letterhead/header-<id>.jpg (drawHeaderBand) and falls back to an
    // ugly code-drawn red band when existsSync() fails; the Chromium (rich)
    // renderer inlines public/letterhead/altus-{header,footer}.png + the entity
    // logo public/logos/<id>.*. public/ is CDN-served and NOT guaranteed on the
    // function FS, so trace both dirs into every letter-PDF route.
    "/api/hr/letters/issue-rich": [CHROMIUM_BIN, "./public/letter-fonts/**", "./public/letterhead/**", "./public/logos/**"],
    "/api/hr/letters/pdf": [CHROMIUM_BIN, "./public/letter-fonts/**", "./public/letterhead/**", "./public/logos/**"],
    "/api/hr/letters/email-pdf": [CHROMIUM_BIN, "./public/letter-fonts/**", "./public/letterhead/**", "./public/logos/**"],
  },
  // Externalize heavy server packages so the bundler does NOT compile their huge
  // trees into every route (the Sentry + OpenTelemetry + Prisma-instrumentation
  // graph was adding ~50s to first-compile of EVERY page). They're require()'d at
  // runtime from node_modules instead. Sentry has no build-time hook here (config
  // isn't wrapped with withSentryConfig), so externalizing the runtime SDK is safe.
  serverExternalPackages: [
    "firebase-admin",
    // DUMMY MODE's fixture database (lib/db/index.ts). PGlite ships PostgreSQL
    // as a WASM blob plus a `.data` file it locates RELATIVE TO ITS OWN MODULE
    // URL. Bundled, that URL becomes the bundler's placeholder root and loading
    // dies with `ERR_INVALID_FILE_URL_PATH: file:///ROOT/.../pglite.data`.
    // Externalizing keeps it a plain runtime require out of node_modules, where
    // the path resolves. It is a devDependency and only reached when
    // DUMMY_MODE=true, so production route graphs never see it.
    "@electric-sql/pglite",
    "pdfkit",
    // Server-only headless-Chromium PDF renderer for rich ("Google Docs") HR
    // letters. Externalized like pdfkit so their large native/binary trees are
    // require()'d at runtime and never compiled into a route graph (and NEVER a
    // client one). Imported lazily inside the server function that runs them.
    "puppeteer-core",
    "@sparticuz/chromium",
    "@sentry/nextjs",
    "@sentry/node",
    "@opentelemetry/instrumentation",
    "@prisma/instrumentation",
  ],
};

export default nextConfig;
