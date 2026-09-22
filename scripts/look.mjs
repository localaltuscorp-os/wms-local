#!/usr/bin/env node
/**
 * look.mjs — SEE THE RUNNING APP.
 *
 * Opens a page on the dummy server in a headless browser, optionally clicks and
 * types through a few steps, saves a PNG and prints what it found (final URL,
 * HTTP status, console errors). Built for Claude sessions: take the shot, open
 * the PNG, fix what looks wrong — instead of asking a human to paste a screenshot.
 *
 * ── TWO RULES, BOTH DELIBERATE ─────────────────────────────────────────────
 * 1. PORT 3002 ONLY. Port 3000 runs against PRODUCTION data (HANDOFF.md) and a
 *    stray click there is a real edit to real records. The target is hard-coded;
 *    a full URL argument is refused.
 * 2. NEVER STARTS OR STOPS THE SERVER. The dummy server holds a PGlite data
 *    directory and an abrupt stop corrupts it. If nothing is listening this
 *    exits and asks a human to run `pnpm dev:dummy` themselves.
 *
 * In DUMMY_MODE there is no login: lib/auth/current.ts returns the seeded Dummy
 * Admin for every request, so a fresh browser lands signed in.
 *
 * USAGE (run from wms-local — `@playwright/test` resolves only from here):
 *   node scripts/look.mjs /hr/record
 *   node scripts/look.mjs /hr/record --click "Select a person" --click "Om"
 *   node scripts/look.mjs /operations/directory --clip "table" --width 1600
 *   node scripts/look.mjs /hr/record --fill "input[type=search]=policy" --full
 *
 * FLAGS
 *   --click "<text | css>"      repeatable; runs in the order given
 *   --fill  "<css>=<value>"     repeatable
 *   --wait  <ms>                extra settle time after the steps
 *   --clip  "<css>"             shoot just that element (smallest image — prefer it)
 *   --full                      full-page shot
 *   --width/--height <px>       viewport (default 1440x900)
 *   --mobile                    390x844 iPhone-ish viewport (desktop UA is kept
 *                               on purpose: proxy.ts rewrites Android UAs to /get-app)
 *   --out <file.png>            explicit output path
 *   --print                     render as the PRINTER sees it (print media +
 *                               A4 width), for checking @media print rules
 *   --quiet                     only print the PNG path
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { connect } from "node:net";
import os from "node:os";
import path from "node:path";

const HOST = "127.0.0.1";
/**
 * PORT 3002 is the default and stays the only port that may be CLICKED.
 *
 * `--live` opens port 3000 instead — the REAL database — and is accepted only
 * when the run has no --click and no --fill, i.e. when the browser will do
 * nothing but load a page and photograph it. The original rule existed because
 * a stray click on 3000 is a real edit to a real record; a navigate-only run
 * cannot make one, and 3002 is being retired (2026-09-17), so refusing to look
 * at the app at all would leave nobody able to see it.
 *
 * GETs are not perfectly side-effect-free in a Next app (a page load can sweep
 * or revalidate), so this is "read-mostly", not "read-only". It is for looking,
 * never for driving.
 */
const DUMMY_PORT = 3002;
const LIVE_PORT = 3000;

/* ---------------- arguments ---------------- */

const argv = process.argv.slice(2);
const steps = []; // {kind:"click"|"fill"|"wait", value}
const opts = { width: 1440, height: 900, wait: 0, full: false, quiet: false };
let target = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  switch (a) {
    case "--click": steps.push({ kind: "click", value: next() }); break;
    case "--fill": steps.push({ kind: "fill", value: next() }); break;
    case "--wait": steps.push({ kind: "wait", value: Number(next()) }); break;
    case "--clip": opts.clip = next(); break;
    case "--full": opts.full = true; break;
    case "--width": opts.width = Number(next()); break;
    case "--height": opts.height = Number(next()); break;
    case "--mobile": opts.width = 390; opts.height = 844; break;
    case "--out": opts.out = next(); break;
    case "--quiet": opts.quiet = true; break;
    case "--live": opts.live = true; break;
    case "--print": opts.print = true; break;
    case "-h": case "--help": help(0); break;
    default:
      if (a.startsWith("--")) fail(`Unknown flag ${a}`, 3);
      if (target) fail(`Two paths given ("${target}" and "${a}") - pass one.`, 3);
      target = a;
  }
}

function help(code) {
  console.log(String(import.meta.url) && `
look.mjs <path> [--click "<text|css>"] [--fill "<css>=<value>"] [--wait <ms>]
         [--clip "<css>"] [--full] [--width <px>] [--height <px>] [--mobile]
         [--out <file.png>] [--quiet]

Target is always ${BASE} - pass a path like /hr/record.`.trim());
  process.exit(code);
}

function fail(message, code = 1) {
  console.error(`look: ${message}`);
  process.exit(code);
}

if (!target) help(3);

// --live: port 3000, and only with nothing to click.
if (opts.live && steps.some((s) => s.kind === "click" || s.kind === "fill")) {
  fail("--live opens the REAL database, so it takes no --click and no --fill. Look, do not drive.", 3);
}
const PORT = opts.live ? LIVE_PORT : DUMMY_PORT;
const BASE = `http://localhost:${PORT}`;

// THE PRODUCTION GUARD. A full URL is refused rather than rewritten: someone
// typing localhost:3000 means to reach 3000, and silently redirecting them to
// 3002 would be its own kind of wrong.
if (/^[a-z]+:\/\//i.test(target)) {
  fail(
    `pass a PATH, not a URL. This tool only ever opens ${BASE} (port 3000 is production data).`,
    3,
  );
}
// GIT BASH MANGLES LEADING SLASHES. MSYS rewrites an argument that starts with
// "/" into a Windows path before node ever sees it, so `/hr/record` arrives as
// `C:/Program Files/Git/hr/record` and the run 404s against a nonsense URL.
// Recover the intended path instead of shooting the wrong page. (Passing
// `hr/record` with no leading slash avoids the rewrite in the first place.)
const msys = target.match(/^[A-Za-z]:[\\/](?:.*[\\/])?Git[\\/](.*)$/i);
if (msys) target = `/${msys[1].replace(/\\/g, "/")}`;

if (!target.startsWith("/")) target = `/${target}`;
const url = `${BASE}${target}`;

/* ---------------- is the dummy server up? ---------------- */

const listening = await new Promise((resolve) => {
  const socket = connect({ host: HOST, port: PORT });
  const done = (v) => { socket.destroy(); resolve(v); };
  socket.setTimeout(1500);
  socket.once("connect", () => done(true));
  socket.once("timeout", () => done(false));
  socket.once("error", () => done(false));
});

if (!listening) {
  fail(
    `nothing is listening on ${PORT}. Start it yourself (\`pnpm dev\` for 3000, \`pnpm dev:dummy\` for 3002) ` +
      `(this script never starts or stops it - an abrupt stop corrupts the .pglite data).`,
    2,
  );
}

/* ---------------- shoot ---------------- */

const outFile =
  opts.out ??
  path.join(
    os.tmpdir(),
    "wms-look",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${target.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}.png`,
  );
await mkdir(path.dirname(outFile), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: opts.width, height: opts.height },
  // A desktop UA on purpose — proxy.ts rewrites Android user agents to /get-app.
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
});
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${e.message}`));

const notes = [];
let status = null;

try {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  status = res?.status() ?? null;
  await settle(page);

  if (opts.print) {
  // What the print dialog would show: print media + an A4-ish content width, so
  // @media print rules and page breaks are visible without a PDF round-trip.
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 794, height: opts.height || 1123 });
}

for (const step of steps) {
    if (step.kind === "wait") {
      await page.waitForTimeout(step.value);
      continue;
    }
    if (step.kind === "fill") {
      // SPLIT AFTER THE SELECTOR, NOT AT THE FIRST "=". An attribute selector
      // carries its own equals signs — `input[placeholder^='Local search']=Om`
      // split at the first one leaves the CSS parser holding `input[placeholder^`.
      const lastBracket = step.value.lastIndexOf("]");
      const eq = step.value.indexOf("=", lastBracket + 1);
      if (eq < 0) { notes.push(`fill "${step.value}" skipped - expected <css>=<value>`); continue; }
      const sel = step.value.slice(0, eq);
      const val = step.value.slice(eq + 1);
      try {
        await page.locator(sel).first().fill(val, { timeout: 8000 });
        notes.push(`filled ${sel}`);
      } catch (e) {
        notes.push(`fill ${sel} FAILED - ${short(e)}`);
      }
      await settle(page);
      continue;
    }
    // click: a CSS-looking string is a selector, anything else is visible text.
    const { raw, asCss } = readTarget(step.value);
    const label = asCss ? raw : `"${raw}"`;
    try {
      const locator = await resolveClick(page, raw, asCss);
      if (!locator) {
        notes.push(`click ${label} FAILED - nothing visible matches [${resolveClick.lastMiss ?? "?"}]`);
      } else {
        await locator.click({ timeout: 8000 });
        notes.push(`clicked ${label}`);
      }
    } catch (e) {
      notes.push(`click ${label} FAILED - ${short(e)}`);
    }
    await settle(page);
  }

  if (opts.wait) await page.waitForTimeout(opts.wait);

  if (opts.clip) {
    const el = page.locator(opts.clip).first();
    try {
      await el.screenshot({ path: outFile, timeout: 10_000 });
    } catch (e) {
      notes.push(`clip "${opts.clip}" FAILED (${short(e)}) - shot the viewport instead`);
      await page.screenshot({ path: outFile });
    }
  } else {
    await page.screenshot({ path: outFile, fullPage: opts.full });
  }
} finally {
  await browser.close().catch(() => {});
}

/**
 * Selector or visible text?
 *
 * A BARE WORD IS TEXT. The first cut treated `^[a-z]+$` as a tag name, so
 * `--click "Om"` hunted for an `<Om>` element, found nothing, and timed out
 * while the person row sat there in plain sight. People click words; they
 * reach for a tag selector almost never. So CSS is only assumed when the string
 * actually looks like one — starts with `.`/`#`/`[`, or is a tag glued to a
 * class/id/attribute/pseudo (`div.card`, `input[type=text]`). Force either
 * reading with a `css=` or `text=` prefix.
 */
function readTarget(value) {
  if (value.startsWith("css=")) return { raw: value.slice(4), asCss: true };
  if (value.startsWith("text=")) return { raw: value.slice(5), asCss: false };
  const looksCss = /^[.#\[]/.test(value) || (/^[a-z][\w-]*[.#\[:]/i.test(value) && !/\s/.test(value));
  return { raw: value, asCss: looksCss };
}

/**
 * Find what a `--click "some text"` actually means, EXACT AND CLICKABLE FIRST.
 *
 * A plain substring match is too eager on a real screen: clicking "Om" matched
 * the onboarding toast in the corner ("...c-om-plete your Onboarding F-o-r-m"),
 * which sits above everything and never settles, so the click timed out while
 * the person row it meant was sitting right there. Exact options/buttons/links
 * come first, then exact text, and loose substring stays as the last resort —
 * it is what makes "Select a person" find a trigger labelled "Select a person…".
 * Only VISIBLE candidates count, so hidden duplicates never win.
 */
async function resolveClick(page, raw, asCss) {
  if (asCss) {
    const css = page.locator(raw);
    return (await css.count().catch(() => 0)) ? css.first() : null;
  }
  const tries = [
    ["option", page.getByRole("option", { name: raw, exact: true })],
    ["button", page.getByRole("button", { name: raw, exact: true })],
    ["link", page.getByRole("link", { name: raw, exact: true })],
    ["text=", page.getByText(raw, { exact: true })],
    ["text~", page.getByText(raw, { exact: false })],
  ];
  const seen = [];
  for (const [name, t] of tries) {
    const n = await t.count().catch((e) => `err(${short(e)})`);
    seen.push(`${name}:${n}`);
    if (typeof n !== "number") continue;
    for (let i = 0; i < Math.min(n, 5); i++) {
      const candidate = t.nth(i);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  }
  // Say WHAT was found, so a miss is debuggable without a second run.
  resolveClick.lastMiss = seen.join(" ");
  return null;
}

/** Let the page settle: network quiet if it gets there, then a beat for animations. */
async function settle(p) {
  await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(300);
}

// A declaration, not a `const` arrow: the step loop above runs BEFORE this line
// is reached, and a const would be in its temporal dead zone — so the first
// failing click crashed the whole run inside its own error handler.
function short(e) {
  return String(e?.message ?? e).split("\n")[0].slice(0, 120);
}

if (opts.quiet) {
  console.log(outFile);
} else {
  const finalUrl = page.url();
  console.log(`shot     ${outFile}`);
  console.log(`asked    ${url}`);
  // A redirect is the usual reason a shot "looks wrong" — /hub, /my-day and
  // /get-app all mean the page under test was never reached.
  console.log(`landed   ${finalUrl}${finalUrl !== url ? "   <-- REDIRECTED" : ""}`);
  console.log(`status   ${status ?? "?"}`);
  for (const n of notes) console.log(`step     ${n}`);
  if (consoleErrors.length) {
    console.log(`console  ${consoleErrors.length} error(s):`);
    for (const e of consoleErrors.slice(0, 10)) console.log(`         ${e.slice(0, 200)}`);
  } else {
    console.log("console  clean");
  }
}

// A 404/500 still produces a PNG (of the error page), and a picture of an error
// page is easy to mistake for the screen under test — so say so in the exit code.
if (status !== null && status >= 400) process.exit(4);
