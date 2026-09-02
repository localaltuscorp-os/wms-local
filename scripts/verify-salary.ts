// @ts-nocheck
// Verify the salary redesign + exports against PROD (mint admin session).
//   pnpm tsx --env-file=.env.local scripts/verify-salary.ts
import { chromium } from "playwright-core";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.SHOOT_BASE || "https://wms.mananvasa.com";
const FULL_UID = process.env.SHOOT_UID_FULL || "Rc4buo6UVqWgWFmSjoKLa6ePxnz1";
const MONTH = "2026-06";
const OUT = "D:/altus-dashboard/.shots";

function adminAuth() {
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
  return getAuth(app);
}
async function mint(uid: string) {
  const customToken = await adminAuth().createCustomToken(uid);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
  const ex = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) })).json();
  if (!ex.idToken) throw new Error(`signIn failed: ${JSON.stringify(ex.error ?? ex)}`);
  const sess = await fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: ex.idToken }) });
  const sc = sess.headers.get("set-cookie");
  const m = sc && /__session=([^;]+)/.exec(sc);
  if (!m) throw new Error(`no __session (status ${sess.status})`);
  return m[1]!;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const val = await mint(FULL_UID);
  const cookieHeader = `__session=${val}`;

  // 0) poll (authed) until the new build's export route is actually live
  for (let i = 1; i <= 30; i++) {
    const r = await fetch(`${BASE}/salary/export.csv?month=${MONTH}`, { headers: { cookie: cookieHeader } });
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("csv")) { console.log(`build live (attempt ${i})`); break; }
    console.log(`attempt ${i}: not live yet (ct=${ct.slice(0, 20)})`);
    await sleep(20000);
  }

  // 1) download the PDF + CSV via authed fetch
  for (const fmt of ["pdf", "csv"]) {
    const r = await fetch(`${BASE}/salary/export.${fmt}?month=${MONTH}`, { headers: { cookie: cookieHeader } });
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(`${OUT}/payroll-${MONTH}.${fmt}`, buf);
    console.log(`export.${fmt}: HTTP ${r.status}, ${buf.length} bytes, type=${r.headers.get("content-type")}`);
    if (fmt === "csv") console.log("--- CSV head ---\n" + buf.toString("utf8").split("\r\n").slice(0, 4).join("\n"));
  }

  // 2) screenshot the redesigned salary page
  const browser = await chromium.launch();
  const url = new URL(BASE);
  const istToday = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addCookies([
    { name: "__session", value: val, domain: url.hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
    { name: "sa_gate_skip", value: istToday, domain: url.hostname, path: "/", secure: true, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/salary?month=${MONTH}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  console.log("salary url:", page.url());
  await page.screenshot({ path: `${OUT}/salary-redesign.png` });
  await browser.close();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
