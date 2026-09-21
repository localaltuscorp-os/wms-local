import "server-only";

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { renderReactToHtml } from "@/lib/pdf/server-render";
import { PolicyDocument } from "@/components/hr/policies/policy-document";
import type { Entity } from "@/lib/hr/entities";
import type { PolicyDoc } from "@/lib/hr/policies/types";
import { renderHtmlToPdf, renderHtmlBatchToPdf } from "@/lib/pdf/chromium";

/**
 * THE FULL POLICY TEXT AS A PDF — body, sections, tables and declaration.
 *
 * ── WHY THIS GOES THROUGH CHROMIUM RATHER THAN pdfkit ──────────────────────
 * The letter engine paints with pdfkit, and a policy in pdfkit would have meant
 * re-implementing every node type — paragraphs, sub-headings, bullet lists,
 * bordered tables, the committee roster, the numbered workflow, the legend grid
 * — by hand, then keeping that second implementation in step with the on-screen
 * one forever. A legal document that renders differently from the version people
 * signed is worse than no export at all.
 *
 * So this renders THE SAME COMPONENT the reader page shows, with
 * `renderToStaticMarkup`, and prints it. There is exactly one policy renderer,
 * and the download cannot drift from the screen.
 *
 * ── HOW LITTLE THIS NEEDS TO KNOW ──────────────────────────────────────────
 * `<PolicyDocument>` is deliberately hook-free and state-free (its own docstring
 * says so), and it — plus `<Letterhead>` beneath it — embeds its CSS as a
 * `<style>` element and its @media print rules, including
 * `@page{size:A4 portrait;margin:0}`. So the static markup is a nearly
 * self-contained printable document, and the two things left to do here are:
 *
 *   1. INLINE THE IMAGES. The components reference `/letterhead/*.png` and the
 *      entity logo by root-relative PATH. `lib/pdf/chromium.ts` allows only
 *      `data:` and the Supabase host, so those would be blocked and the
 *      document would print with no letterhead. Every `src="/…"` (and any
 *      `url(/…)` inside a style attribute) is rewritten to a base64 data URI.
 *
 *   2. NAME THE FONTS. The CSS asks for `var(--font-display)` / `var(--font-body)`,
 *      which resolve against the app's stylesheet — absent in a standalone
 *      document, so every rule would fall through to its Georgia/system-ui
 *      fallback and Chromium on Vercel ships almost no fonts. Declaring those two
 *      variables against embedded copies of the real house faces is what makes
 *      the printed policy look like the one on screen.
 */

const publicDir = path.join(process.cwd(), "public");
const FONTS_DIR = path.join(process.cwd(), "app", "fonts");

/* ------------------------------------------------------------------ */
/* Asset inlining                                                       */
/* ------------------------------------------------------------------ */

function mimeFor(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

/** Read a file under `base` and return a base64 data URI, or null. Guards
 *  against escaping the directory via `..`. */
async function fileToDataUri(base: string, rel: string): Promise<string | null> {
  try {
    const abs = path.resolve(base, rel.replace(/^\/+/, ""));
    if (!abs.startsWith(path.resolve(base))) return null;
    if (!existsSync(abs)) return null;
    const buf = await readFile(abs);
    return `data:${mimeFor(path.extname(abs).toLowerCase())};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Rewrite every root-relative asset reference to a base64 data URI.
 *
 * Handles `<img src="/…">` and `url(/…)` inside inline style attributes (the
 * Letterhead positions its art that way in places). Anything that will not
 * resolve is LEFT ALONE rather than blanked, so a missing asset degrades to the
 * same blocked request it would have been, instead of silently emitting an
 * empty `src`.
 */
export async function inlinePublicAssets(html: string): Promise<string> {
  const refs = new Set<string>();
  const srcRe = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(\/[^"']*)\2/gi;
  const urlRe = /url\(\s*(["']?)(\/[^"')]+)\1\s*\)/gi;

  for (const m of html.matchAll(srcRe)) refs.add(m[3]!);
  for (const m of html.matchAll(urlRe)) refs.add(m[2]!);

  const resolved = new Map<string, string>();
  await Promise.all(
    [...refs].map(async (ref) => {
      const uri = await fileToDataUri(publicDir, ref);
      if (uri) resolved.set(ref, uri);
    }),
  );
  if (resolved.size === 0) return html;

  const swap = (whole: string, prefix: string, quote: string, ref: string): string => {
    const uri = resolved.get(ref);
    return uri ? `${prefix}${quote}${uri}${quote}` : whole;
  };

  return html
    .replace(srcRe, (whole, prefix: string, quote: string, ref: string) =>
      swap(whole, prefix, quote, ref),
    )
    .replace(urlRe, (whole, quote: string, ref: string) =>
      resolved.has(ref) ? `url("${resolved.get(ref)}")` : whole,
    );
}

/**
 * The house faces, embedded, and bound to the two variables the policy CSS
 * asks for. Bricolage Grotesque is what `--font-display` resolves to in
 * `app/layout.tsx`; Inter backs the body.
 */
async function fontCss(): Promise<string> {
  const [display, body] = await Promise.all([
    fileToDataUri(FONTS_DIR, "bricolage-grotesque-latin.woff2"),
    fileToDataUri(FONTS_DIR, "inter-latin.woff2"),
  ]);
  const rules: string[] = [];
  if (display) {
    rules.push(
      `@font-face{font-family:"AltusDisplay";src:url(${display}) format("woff2");` +
        `font-weight:300 800;font-style:normal;font-display:swap;}`,
    );
  }
  if (body) {
    rules.push(
      `@font-face{font-family:"AltusBody";src:url(${body}) format("woff2");` +
        `font-weight:100 900;font-style:normal;font-display:swap;}`,
    );
  }
  return `${rules.join("\n")}
:root{
  --font-display:"AltusDisplay",Georgia,"Times New Roman",serif;
  --font-serif:"AltusDisplay",Georgia,"Times New Roman",serif;
  --font-body:"AltusBody",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-sans:"AltusBody",system-ui,-apple-system,"Segoe UI",sans-serif;
}`;
}

/**
 * Assemble the complete A4 HTML document for one policy.
 *
 * Split out from the render so a batch ("download everything") can build N
 * documents up front and hand them to ONE browser launch — see
 * `renderHtmlBatchToPdf`.
 */
export async function buildPolicyHtml({
  doc,
  entity,
}: {
  doc: PolicyDoc;
  entity: Entity;
}): Promise<string> {
  // `renderReactToHtml` rather than `renderToStaticMarkup` directly: importing
  // `react-dom/server` into THIS file (which contains JSX) fails `next build`.
  // See lib/pdf/server-render.ts.
  const markup = await renderReactToHtml(<PolicyDocument doc={doc} entity={entity} />);
  const [bodyHtml, css] = await Promise.all([inlinePublicAssets(markup), fontCss()]);

  // `@page` is already declared by the letterhead's own print CSS; repeating it
  // here is harmless and makes the document correct even if that ever changes.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794">
<style>
${css}
@page{size:A4 portrait;margin:0;}
html,body{margin:0;padding:0;background:#fff;}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * Render one policy, on its letterhead, as a complete A4 PDF.
 *
 * Throws if Chromium is unavailable; callers decide how to degrade. There is no
 * partial success here — a half-rendered legal document is worse than an error.
 */
export async function renderPolicyPdf({
  doc,
  entity,
}: {
  doc: PolicyDoc;
  entity: Entity;
}): Promise<Uint8Array> {
  return await renderHtmlToPdf(await buildPolicyHtml({ doc, entity }));
}

/**
 * Render several policies, in order, on a SINGLE browser launch.
 *
 * For the "download all my policies" packet: each policy also needs its
 * acknowledgement appended, and a browser launch per policy would put a
 * multi-second cost on each one. One launch, N documents.
 */
export async function renderPolicyPdfs(
  docs: readonly PolicyDoc[],
  entity: Entity,
): Promise<Uint8Array[]> {
  if (docs.length === 0) return [];
  const htmls = await Promise.all(docs.map((doc) => buildPolicyHtml({ doc, entity })));
  return await renderHtmlBatchToPdf(htmls);
}
