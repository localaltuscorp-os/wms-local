#!/usr/bin/env node
/**
 * WHAT WILL VERCEL BILL AS "FUNCTIONS STORAGE"?
 *
 * Vercel sums the UNCOMPRESSED size of every deployed serverless function, and
 * limits that at 10 GB. A serverless function's contents are decided at build
 * time by Next's file tracer, which writes one `<page>.nft.json` per function
 * listing the files to copy in. So the number on the Vercel usage page is
 * computable locally, before deploying, from `.next/server`.
 *
 * ── WHY THIS SCRIPT EXISTS ─────────────────────────────────────────────────
 * This quota has been blown three times, and each time the diagnosis was done by
 * hand and thrown away. The trap it exists to catch is specific and has now
 * bitten twice:
 *
 *   A devDependency that production can never execute gets traced into HUNDREDS
 *   of functions, because something in a widely-imported module references it.
 *   PGlite (PostgreSQL-as-WASM, DUMMY_MODE only) was 17.2 MB x 426 functions =
 *   7.14 GB. It was "fixed" by hiding the `require()` behind a variable
 *   specifier — while a static `import { drizzle } from "drizzle-orm/pglite"`
 *   sat on line 2 of the same file, which traces it identically. Fixing the
 *   require and not the import is the whole failure mode.
 *
 * ── HOW TO READ THE OUTPUT ─────────────────────────────────────────────────
 * `functions` is the number Vercel counts, and `total` is compared against the
 * 10 GB allowance. `byPackage` is the actionable part: a package present in most
 * functions is the one costing gigabytes, and a package that is present in
 * nearly every function but is only needed by one route is a tracer leak.
 *
 * ── CAVEAT, LEARNED THE HARD WAY (next.config.ts records the full story) ───
 * A trace can be INCOMPLETE, and an incomplete trace reports a small number
 * that means nothing: builds following `rm -rf .next` have produced traces with
 * NO node_modules at all — zero for @sparticuz/chromium, zero for postgres. An
 * app missing its own database driver cannot run, so those numbers are wrong,
 * not thrifty. This script therefore refuses to report a total it believes is
 * truncated: if no function lists any node_modules file, it says so and exits
 * non-zero rather than printing a reassuring, meaningless "1.9 GB".
 *
 * ── WHICH ENGINE TO TRUST, HERE ────────────────────────────────────────────
 * `--leaks` and the size table answer different questions and do NOT fail alike:
 *
 *   `--leaks`  reads the WEBPACK OUTPUT. A local `pnpm build` compiles fine (the
 *              page-data collection that fails locally without .env.local happens
 *              AFTER compilation), so the chunks are real and this check is
 *              trustworthy locally. It is the one to run before pushing.
 *   default    sums NFT TRACES, and those come from the build's LAST stage, so
 *              they are empty whenever a local build does not finish. Note also
 *              that `pnpm build` begins with `rm -rf .next`, so the "reuse an
 *              existing .next" advice in next.config.ts cannot be followed via
 *              the npm script anyway.
 *
 * Practical rule: run `--leaks` locally, confirm the number ON VERCEL after a
 * deploy. Do not quote a local size total to anybody.
 *
 * Usage:  node scripts/measure-functions-storage.mjs [--top 25] [--package NAME]
 *         node scripts/measure-functions-storage.mjs --leaks [--watch pkg]
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

const ROOT = resolve(process.cwd());
const SERVER = join(ROOT, ".next", "server");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const TOP = Number(flag("--top", 25));
const ONLY = flag("--package", null);

if (!existsSync(SERVER)) {
  console.error(`No build output at ${relative(ROOT, SERVER)}. Run \`pnpm build\` first.`);
  process.exit(2);
}

/**
 * ── LEAK DETECTION: the check that does NOT depend on the tracer ───────────
 *
 * `--leaks` scans the built server output for LITERAL module specifiers —
 * `require("pkg")` and `import("pkg")`. That is the exact form Next's file
 * tracer follows, so a literal specifier in a route's chunk is a package that
 * will be copied into that function, and its size multiplied by the number of
 * chunks that carry it.
 *
 * This matters because it works when the tracer's own output is useless (see
 * the CAVEAT), and because it names the CAUSE rather than the symptom. A size
 * total tells you the bill; this tells you which line to delete.
 *
 * Read it as: a package used by ONE feature appearing in hundreds of chunks is
 * a leak. A package in a handful of chunks is that feature paying for itself.
 */
const WATCHED = [
  // DUMMY_MODE's fixture database. Nothing in production may execute it, so it
  // belongs in ZERO route chunks. (Two leaks have already come from here: the
  // direct require, then drizzle-orm/pglite's own import of it.)
  "@electric-sql/pglite",
  "drizzle-orm/pglite",
  // Headless PDF rendering cluster. Legitimately in the letter + policy PDF
  // routes only — a handful of functions, not hundreds.
  "@sparticuz/chromium",
  "puppeteer-core",
  "pdf-lib",
  "pdfkit",
  // Server SDKs with big dependency trees, expected in some routes.
  "firebase-admin",
  "@sentry/nextjs",
];

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Count chunks holding a literal specifier. Deliberately stricter than
 * `includes()`: the specifier must sit inside `require(`/`import(` quotes, so a
 * package named in a COMMENT, a plain string, or a variable-held specifier
 * (`const P = "pkg"; require(P)` — the approved hiding idiom) is NOT counted.
 * Counting those would flag the fix itself as the bug.
 *
 * A trailing `/` is allowed after the specifier so `require("pkg/sub")` counts
 * against `pkg` — subpath imports are the same package on disk.
 */
function literalRefs(spec) {
  const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:require|import)\\(\\s*["'\`]${escaped}(?:/|["'\`])`);
}

if (argv.includes("--leaks")) {
  const files = jsFiles(SERVER);
  if (files.length === 0) {
    console.error(`No built JS under ${relative(ROOT, SERVER)}. Run \`pnpm build\` first.`);
    process.exit(2);
  }
  const extra = flag("--watch", null);
  const watch = extra ? [...WATCHED, ...extra.split(",")] : WATCHED;

  console.log(`\nTRACE LEAKS — literal specifiers across ${files.length} built server files`);
  console.log("A package used by one feature should appear in a few files, not hundreds.\n");

  // Read each chunk ONCE and test every pattern against it. These files run to
  // hundreds of KB and there are a thousand of them; re-reading per specifier
  // turned a two-second check into a minute of disk I/O.
  const matchers = watch.map((spec) => ({ spec, re: literalRefs(spec), count: 0 }));
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of matchers) if (m.re.test(text)) m.count++;
  }
  const rows = matchers.map(({ spec, count }) => ({ spec, count }));

  rows.sort((a, b) => b.count - a.count);
  let leaked = 0;
  for (const { spec, count } of rows) {
    // A package legitimately needed by a couple of routes sits in a couple of
    // chunks. Hundreds means it reached the shared graph — i.e. it is on the
    // path from something almost every page imports.
    const verdict = count === 0 ? "clean" : count <= 5 ? "scoped" : "LEAK";
    if (verdict === "LEAK") leaked++;
    console.log(`  ${verdict.padEnd(7)} ${String(count).padStart(4)} files   ${spec}`);
  }

  console.log(
    leaked === 0
      ? "\nNo leaks: every watched package is either absent or confined to the routes that use it.\n"
      : `\n${leaked} leaked specifier(s). Each one is copied into every function that carries it —\n` +
          "for a package this size, that is gigabytes. Find the import that puts it on the path\n" +
          "from a widely-imported module (lib/db is the usual culprit) and hide it behind a\n" +
          "variable specifier, then re-run this check on a fresh build.\n",
  );
  process.exit(leaked === 0 ? 0 : 1);
}

/** Every *.nft.json under .next/server, recursively. */
function traces(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...traces(full));
    else if (entry.name.endsWith(".nft.json")) out.push(full);
  }
  return out;
}

/**
 * The package a traced path belongs to, or a coarse bucket for the app itself.
 * pnpm stores real copies under `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>`,
 * so the LAST `node_modules/` segment is the one that names the package.
 */
function packageOf(relPath) {
  const parts = relPath.split(/[\\/]/);
  const last = parts.lastIndexOf("node_modules");
  if (last !== -1 && parts[last + 1]) {
    return parts[last + 1].startsWith("@")
      ? `${parts[last + 1]}/${parts[last + 2] ?? ""}`
      : parts[last + 1];
  }
  return "(app + framework)";
}

const traceFiles = traces(SERVER);
if (traceFiles.length === 0) {
  console.error(`No .nft.json files under ${relative(ROOT, SERVER)} — the build did not trace.`);
  process.exit(2);
}

let total = 0;
let nodeModulesTotal = 0;
const byPackage = new Map(); // package -> { bytes, functions:Set }
const perFunction = [];

for (const traceFile of traceFiles) {
  let data;
  try {
    data = JSON.parse(readFileSync(traceFile, "utf8"));
  } catch {
    continue; // a malformed trace is not this script's problem
  }
  const base = resolve(traceFile, "..");
  let functionBytes = 0;
  const seen = new Set();

  for (const rel of data.files ?? []) {
    const abs = resolve(base, rel);
    if (seen.has(abs)) continue;
    seen.add(abs);
    let size = 0;
    try {
      size = statSync(abs).size;
    } catch {
      continue; // traced but absent — usually a glob that matched nothing
    }
    functionBytes += size;
    total += size;

    const pkg = packageOf(relative(ROOT, abs));
    if (pkg !== "(app + framework)") nodeModulesTotal += size;

    if (!byPackage.has(pkg)) byPackage.set(pkg, { bytes: 0, functions: new Set() });
    const rec = byPackage.get(pkg);
    rec.bytes += size;
    rec.functions.add(traceFile);
  }

  perFunction.push({ name: relative(SERVER, traceFile).replace(/\.nft\.json$/, ""), bytes: functionBytes });
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const fmt = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`);

// ── The truncation guard. See CAVEAT above. ─────────────────────────────────
if (nodeModulesTotal === 0) {
  console.error(
    "\nREFUSING TO REPORT A TOTAL.\n" +
      `All ${traceFiles.length} traces are empty of node_modules — no postgres, no chromium.\n` +
      "That is a broken trace, not a small deploy (an app without its own database\n" +
      "driver cannot run). This is what a build does after `rm -rf .next`.\n" +
      "Rebuild WITHOUT deleting .next first, so the tracer can reuse its cache.\n",
  );
  process.exit(1);
}

perFunction.sort((a, b) => b.bytes - a.bytes);
const ranked = [...byPackage.entries()]
  .map(([name, r]) => ({ name, bytes: r.bytes, functions: r.functions.size }))
  .sort((a, b) => b.bytes - a.bytes);

console.log(`\nFUNCTIONS STORAGE — ${traceFiles.length} functions traced`);
console.log(`  TOTAL            ${fmt(total)}   (allowance 10 GB)`);
console.log(`  of which modules ${fmt(nodeModulesTotal)}  (${Math.round((nodeModulesTotal / total) * 100)}%)`);
console.log(`  largest function ${perFunction[0]?.name ?? "-"} at ${fmt(perFunction[0]?.bytes ?? 0)}`);

const shown = ONLY ? ranked.filter((r) => r.name === ONLY) : ranked.slice(0, TOP);
if (ONLY && shown.length === 0) console.log(`\n  ${ONLY} is not traced into any function.`);

console.log(`\nBY PACKAGE${ONLY ? "" : ` (top ${Math.min(TOP, ranked.length)} of ${ranked.length})`}`);
for (const r of shown) {
  const spread = `${r.functions}/${traceFiles.length} fns`;
  console.log(`  ${r.name.padEnd(38)} ${fmt(r.bytes).padStart(9)}  ${spread.padEnd(13)} ${(r.bytes / r.functions / MB).toFixed(1)} MB each`);
}

console.log(`\nLARGEST FUNCTIONS`);
for (const f of perFunction.slice(0, 10)) {
  console.log(`  ${fmt(f.bytes).padStart(9)}  ${f.name}`);
}
console.log();
