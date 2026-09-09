import "server-only";

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getEntity, DEFAULT_ENTITY_ID, type Entity, type EntityId } from "@/lib/hr/entities";
import { letterFontsUsedIn } from "@/lib/hr/letters/fonts";

/**
 * HR LETTERS — server-only headless-Chromium PDF renderer for RICH ("Edit
 * freely" / Google-Docs) letters.
 *
 * A rich letter's body is arbitrary TipTap HTML (headings, lists, tables,
 * inline images, alignment …) that pdfkit cannot faithfully paint. Instead we
 * assemble a FULL standalone A4 HTML document that reproduces the FROZEN
 * <Letterhead> (components/hr/letterhead/letterhead.tsx) exactly — the
 * altus-header.png strip pinned to the top, the altus-footer.png strip pinned
 * to the bottom, the same 794×1123 page box + body padding, and (for a
 * non-Altus paying entity) the white logo-cover + entity-logo swap — inject the
 * body HTML, and print it to PDF with headless Chromium.
 *
 * The letterhead strip PNGs and entity logos are read off the local filesystem
 * (public/letterhead/*.png, public/logos/*.png) and inlined as base64 data URIs
 * so Chromium can render the page WITHOUT a running Next.js server. Any inline
 * letter <img> whose src is a private-bucket storage PATH (not http/https/data)
 * is resolved to a fresh signed URL before printing.
 *
 * Chromium launch is ENV-AWARE:
 *   · Vercel / production  → @sparticuz/chromium + puppeteer-core
 *   · local dev            → puppeteer-core channel:"chrome" (dev has Chrome),
 *                            falling back to a discovered Windows Chrome/Edge.
 *
 * puppeteer-core + @sparticuz/chromium are imported LAZILY (await import) and
 * are in next.config.ts serverExternalPackages, so their large binary trees
 * never reach a route/client graph (webpack-hang rule). Load-neutral.
 */

/* ------------------------------------------------------------------ */
/* Asset inlining                                                       */
/* ------------------------------------------------------------------ */

const publicDir = path.join(process.cwd(), "public");
const HEADER_ART_FILE = path.join(publicDir, "letterhead", "altus-header.png");
const FOOTER_ART_FILE = path.join(publicDir, "letterhead", "altus-footer.png");
const LETTER_FONTS_DIR = path.join(publicDir, "letter-fonts");

/** Read a public asset off disk and return a base64 `data:` URI (or null). */
async function fileToDataUri(absPath: string): Promise<string | null> {
  try {
    if (!existsSync(absPath)) return null;
    const buf = await readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".svg"
                ? "image/svg+xml"
                : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Build `@font-face` rules (base64-inlined woff2) for exactly the self-hosted
 * letter fonts REFERENCED in the body HTML. Headless Chromium has no network +
 * ships no fonts of its own, so every chosen family must be embedded here or it
 * silently falls back — this is what makes the printed letter match the editor.
 * Only used families are embedded, keeping the document small.
 */
async function buildLetterFontFaceCss(bodyHtml: string): Promise<string> {
  const used = letterFontsUsedIn(bodyHtml);
  if (used.length === 0) return "";
  const rules: string[] = [];
  await Promise.all(
    used.flatMap((f) =>
      f.weights.map(async (w) => {
        const file = path.join(LETTER_FONTS_DIR, `${f.id}-${w}.woff2`);
        const uri = await fileToDataUri(file);
        if (uri) {
          rules.push(
            `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${w};` +
              `font-display:swap;src:url(${uri}) format("woff2");}`,
          );
        }
      }),
    ),
  );
  return rules.join("\n");
}

/** Resolve the entity logo file (public/logos/<id>.png) → data URI, guarded. */
async function entityLogoDataUri(entity: Entity): Promise<string | null> {
  const rel = entity.logo.replace(/^\//, "");
  const p = path.join(publicDir, rel);
  const uri = await fileToDataUri(p);
  if (uri) return uri;
  return fileToDataUri(path.join(publicDir, "logo.png"));
}

/* ------------------------------------------------------------------ */
/* Inline image → signed URL resolution                                 */
/* ------------------------------------------------------------------ */

/** Inline-image signed-URL TTL (1 hour is ample for a one-shot render). */
const IMAGE_SIGNED_TTL_SECONDS = 60 * 60;

/**
 * Any inline letter <img> whose src is a private `documents`-bucket storage PATH
 * (i.e. not http/https/data/file) is resolved to a fresh signed URL so Chromium
 * can fetch it. Already-signed https URLs and data URIs are left untouched.
 */
async function resolveInlineImages(bodyHtml: string): Promise<string> {
  const srcRe = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi;

  // Collect the distinct storage paths that need signing.
  const paths = new Set<string>();
  for (const m of bodyHtml.matchAll(srcRe)) {
    const raw = (m[3] || "").trim();
    if (!raw) continue;
    if (/^(https?:|data:|file:|blob:)/i.test(raw)) continue;
    paths.add(raw.replace(/^\/+/, ""));
  }
  if (paths.size === 0) return bodyHtml;

  const signed = new Map<string, string>();
  try {
    const { getSupabaseAdmin, DOCUMENTS_BUCKET } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();
    await Promise.all(
      [...paths].map(async (p) => {
        try {
          const { data } = await admin.storage
            .from(DOCUMENTS_BUCKET)
            .createSignedUrl(p, IMAGE_SIGNED_TTL_SECONDS);
          if (data?.signedUrl) signed.set(p, data.signedUrl);
        } catch {
          /* leave unresolved — Chromium simply shows a broken image */
        }
      }),
    );
  } catch {
    // Supabase admin unavailable → leave paths as-is.
    return bodyHtml;
  }

  return bodyHtml.replace(srcRe, (whole, pre: string, q: string, src: string) => {
    const key = (src || "").trim().replace(/^\/+/, "");
    const url = signed.get(key);
    return url ? `${pre}${q}${url}${q}` : whole;
  });
}

/* ------------------------------------------------------------------ */
/* Standalone A4 document (frozen letterhead, exact)                     */
/* ------------------------------------------------------------------ */

/**
 * Build the full standalone HTML document. Mirrors letterhead.tsx: A4 page box
 * (794×1123), header strip pinned top + footer strip pinned bottom (position
 * fixed so they REPEAT on every printed page, exactly like the letterhead's
 * @media print rules), body padding 198px 70px 104px, and for a non-Altus
 * entity the white cover + entity-logo swap. @page A4 zero-margin +
 * print-color-adjust:exact so the strips print edge-to-edge.
 */
function buildDocument(opts: {
  headerUri: string | null;
  footerUri: string | null;
  overlayLogo: boolean;
  logoUri: string | null;
  logoAlt: string;
  bodyHtml: string;
  fontFaceCss: string;
}): string {
  const { headerUri, footerUri, overlayLogo, logoUri, logoAlt, bodyHtml, fontFaceCss } = opts;

  const headerImg = headerUri
    ? `<img class="alh-art alh-art-top" src="${headerUri}" alt="" aria-hidden="true">`
    : "";
  const footerImg = footerUri
    ? `<img class="alh-art alh-art-bottom" src="${footerUri}" alt="" aria-hidden="true">`
    : "";
  const logoSwap =
    overlayLogo && logoUri
      ? `<span class="alh-logo-cover" aria-hidden="true"></span>` +
        `<img class="alh-logo" src="${logoUri}" alt="${escAttr(logoAlt)}">`
      : overlayLogo
        ? `<span class="alh-logo-cover" aria-hidden="true"></span>`
        : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794">
<style>
${fontFaceCss}
${LETTERHEAD_CSS}
</style>
</head>
<body>
  <div class="alh-page">
    ${headerImg}
    ${logoSwap}
    ${footerImg}
    <table class="alh-frame">
      <thead><tr><td><div class="alh-head-space"></div></td></tr></thead>
      <tbody><tr><td><main class="alh-body">${bodyHtml}</main></td></tr></tbody>
      <tfoot><tr><td><div class="alh-foot-space"></div></td></tr></tfoot>
    </table>
  </div>
</body>
</html>`;
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * CSS reproduces letterhead.tsx (incl. its @media print behaviour) for a
 * headless print run: fixed header/footer strips that repeat across pages, the
 * non-Altus logo swap, A4 zero-margin page, exact colour printing. Body styles
 * for common rich-letter marks (headings, lists, tables, images, alignment) so
 * arbitrary TipTap HTML lands on-brand.
 */
const LETTERHEAD_CSS = `
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4 portrait;margin:0;}
html,body{margin:0;padding:0;background:#ffffff;}
.alh-page{
  position:relative;
  width:794px;
  min-height:1123px;
  margin:0 auto;padding:0;
  background:#ffffff;
  color:#111114;
  overflow:hidden;
}
/* Header + footer artwork — crisp, edge-to-edge, natural aspect. Fixed so they
   repeat on every printed page (matches letterhead.tsx @media print). The strips
   are cropped to their ink (see letterhead.tsx), so left:0/top:0 really is the
   paper edge — no white gutter above or beside the banner. */
.alh-art{position:fixed;left:0;width:794px;height:auto;margin:0;padding:0;display:block;z-index:0;pointer-events:none;}
.alh-art-top{top:0;}
.alh-art-bottom{bottom:0;}
/* Per-entity logo swap (non-Altus): white cover wipes the baked-in Altus logo…
   fixed so the swap repeats on every printed page alongside the header strip. */
.alh-logo-cover{position:fixed;left:0;top:0;width:140px;height:158px;background:#ffffff;z-index:1;}
/* …then the entity's own logo is pasted in its place. */
.alh-logo{
  position:fixed;left:26px;top:16px;
  height:122px;width:auto;max-width:126px;
  object-fit:contain;display:block;z-index:2;
}
/* Page frame — thead/tfoot are empty spacer bands the browser REPEATS + reserves
   on every printed page, so the body never slides under the fixed header/footer
   on page 2+. (Same technique as letterhead.tsx.) */
.alh-frame{position:relative;z-index:3;width:100%;border-collapse:collapse;table-layout:fixed;}
.alh-frame>thead>tr>td,.alh-frame>tbody>tr>td,.alh-frame>tfoot>tr>td{padding:0;border:0;vertical-align:top;}
.alh-head-space{height:196px;}
.alh-foot-space{height:100px;}
/* Body */
.alh-body{
  padding:2px 70px 8px;
  font-family:Georgia,"Times New Roman",serif;
  font-size:15px;line-height:1.72;color:#111114;
  overflow-wrap:break-word;
}
/* Justify generated-letter prose by default; explicit per-paragraph
   text-align styles (from the editor) still win. */
.alh-body p{margin:0 0 14px;text-align:left;}
.alh-body h1{font-size:22px;line-height:1.3;margin:0 0 12px;font-weight:700;}
.alh-body h2{font-size:18px;line-height:1.35;margin:18px 0 10px;font-weight:700;}
.alh-body h3{font-size:15.5px;line-height:1.4;margin:16px 0 8px;font-weight:700;}
/* Lists — this document is standalone (no Tailwind preflight), so markers came
 * from the UA defaults and already printed correctly. Stated explicitly anyway
 * so the PDF matches the in-app editor rule for rule: this file drifting from
 * the screen is exactly how the bug hid — the same letter printed with bullets
 * while the editor showed none. Nested levels mirror the UA sequence, so this
 * is a no-op on today's output, not a restyle. */
.alh-body ul,.alh-body ol{margin:0 0 14px;padding-left:24px;}
.alh-body ul{list-style:disc outside;}
.alh-body ul ul{list-style-type:circle;}
.alh-body ul ul ul{list-style-type:square;}
.alh-body ol{list-style:decimal outside;}
.alh-body ol ol{list-style-type:lower-alpha;}
.alh-body ol ol ol{list-style-type:lower-roman;}
.alh-body li{margin:0 0 6px;}
.alh-body li p{margin:0;}
.alh-body li>ul,.alh-body li>ol{margin:6px 0 0;}
.alh-body strong{font-weight:700;}
/* Employment-terms as a professional bordered 2-column table (was colon text). */
.alh-body .alw-termtable{border-collapse:collapse;margin:8px 0 18px;width:100%;border:1px solid #d4d4d8;}
.alh-body .alw-termtable th.alw-tt-label{text-align:left;vertical-align:top;font-weight:700;padding:7px 12px;width:38%;background:#f6f5f7;border:1px solid #d4d4d8;}
.alh-body .alw-termtable td.alw-tt-val{vertical-align:top;padding:7px 12px;border:1px solid #d4d4d8;}
.alh-body a{color:#A80400;text-decoration:underline;}
.alh-body img{max-width:100%;height:auto;}
.alh-body table{border-collapse:collapse;width:100%;margin:0 0 14px;font-variant-numeric:tabular-nums;}
.alh-body th,.alh-body td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left;vertical-align:top;}
.alh-body th{background:#f2f3f6;font-weight:700;color:#334155;}
.alh-body sub,.alh-body sup{font-size:.72em;line-height:0;}
.alh-body hr{border:none;border-top:1px solid #E2E8F0;margin:18px 0;}
/* Empty-field markers survive an eject; render them subtly instead of raw. */
.alh-body .letter-field-empty{color:#A80400;background:#FCE9E8;border-radius:3px;padding:0 3px;}
`;

/* ------------------------------------------------------------------ */
/* Chromium launch + render                                             */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Candidate Windows Chrome / Edge executables for the dev fallback. */
function windowsChromeCandidates(): string[] {
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] || "";
  const list = [
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
    local ? path.join(local, "Google", "Chrome", "Application", "chrome.exe") : "",
    path.join(pf, "Google", "Chrome Beta", "Application", "chrome.exe"),
    path.join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return list.filter(Boolean);
}

/** Launch a headless browser appropriate to the runtime. Throws on failure. */
async function launchBrowser(): Promise<any> {
  const puppeteer = await import("puppeteer-core");
  const onVercel = !!process.env.VERCEL || process.env.NODE_ENV === "production";

  if (onVercel) {
    const chromium = (await import("@sparticuz/chromium")).default as any;
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    } as any);
  }

  // Local dev — prefer the installed Chrome via the "chrome" channel.
  try {
    return await puppeteer.launch({ channel: "chrome", headless: true } as any);
  } catch {
    // Fall back to a discovered Windows Chrome / Edge binary.
    for (const candidate of windowsChromeCandidates()) {
      if (existsSync(candidate)) {
        return puppeteer.launch({ executablePath: candidate, headless: true } as any);
      }
    }
    throw new Error(
      "No Chrome/Chromium found for PDF rendering. Install Google Chrome (dev) " +
        "or ensure @sparticuz/chromium is deployed (production).",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Public entry                                                         */
/* ------------------------------------------------------------------ */

export interface RenderRichLetterInput {
  /** Paying entity (id / display string). Drives the letterhead logo swap. */
  entity: string;
  /** The rich letter body — arbitrary TipTap HTML. */
  bodyHtml: string;
}

/**
 * Render a rich HR letter (free-form TipTap HTML) to a print-ready A4 PDF on the
 * selected paying-entity letterhead, via headless Chromium.
 */
export async function renderRichLetterPdf({
  entity,
  bodyHtml,
}: RenderRichLetterInput): Promise<Uint8Array> {
  const e = getEntity((entity as EntityId | string) ?? null);
  const overlayLogo = e.id !== DEFAULT_ENTITY_ID;

  const [headerUri, footerUri, logoUri, resolvedBody, fontFaceCss] = await Promise.all([
    fileToDataUri(HEADER_ART_FILE),
    fileToDataUri(FOOTER_ART_FILE),
    overlayLogo ? entityLogoDataUri(e) : Promise.resolve(null),
    resolveInlineImages(bodyHtml || ""),
    buildLetterFontFaceCss(bodyHtml || ""),
  ]);

  const html = buildDocument({
    headerUri,
    footerUri,
    overlayLogo,
    logoUri,
    logoAlt: `${e.displayName} logo`,
    bodyHtml: resolvedBody,
    fontFaceCss,
  });

  let browser: any = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // ── SSRF / exfiltration hardening ──────────────────────────────────────
    // The body HTML is user-authored (the "Edit freely" letter). Without this,
    // headless Chromium would execute any injected <script> and fetch any
    // sub-resource from the SERVER's network position — SSRF to internal hosts /
    // cloud metadata, file:// reads, and beaconing out. We:
    //   1) disable JavaScript entirely (a printed letter needs none), and
    //   2) intercept every request and allow ONLY `data:` URIs (our inlined
    //      letterhead/fonts/images) and the Supabase signed-URL host (legit
    //      inline letter images resolved by resolveInlineImages). Everything
    //      else — http/https to any other host, file:, blob:, internal IPs — is
    //      aborted.
    await page.setJavaScriptEnabled(false);
    const supabaseHost = (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
      } catch {
        return "";
      }
    })();
    await page.setRequestInterception(true);
    page.on("request", (r: any) => {
      const url: string = r.url();
      if (url.startsWith("data:")) return void r.continue();
      try {
        const host = new URL(url).host;
        if (supabaseHost && host === supabaseHost) return void r.continue();
      } catch {
        /* unparseable → block */
      }
      return void r.abort();
    });

    // `networkidle0` waited for ALL sub-resource loads (part of the SSRF risk).
    // With interception in place only allowlisted resources load; `load` is
    // sufficient and avoids hanging on aborted requests.
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(pdf);
  } catch (err) {
    throw new Error(
      `Rich letter PDF render failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}
