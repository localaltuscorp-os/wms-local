// @ts-nocheck
// Authed screenshot of the DCC v2 board (Ruchita — participant cards + client
// sections + trays) against PROD. Not shipped.
//   pnpm tsx --env-file=.env.local scripts/shoot-dcc.ts
import { chromium } from "playwright-core";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOOT_BASE || "https://wms.mananvasa.com";
const FULL_UID = process.env.SHOOT_UID_FULL || "Rc4buo6UVqWgWFmSjoKLa6ePxnz1";
const RUCHITA = "989ef576-db34-4d23-a095-5ae06b4e2873";
const OUT = "D:/altus-dashboard/.shots";

const ROUTES = [{ path: `/dcc?emp=${RUCHITA}`, name: "dcc-ruchita-v2" }];

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
  const exch = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  const exj = await exch.json();
  if (!exj.idToken) throw new Error(`signIn failed: ${JSON.stringify(exj.error ?? exj)}`);
  const sess = await fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: exj.idToken }) });
  const sc = sess.headers.get("set-cookie");
  const m = sc && /__session=([^;]+)/.exec(sc);
  if (!m) throw new Error(`no __session (status ${sess.status})`);
  return m[1]!;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`Minting session against ${BASE}…`);
  const val = await mint(FULL_UID);
  const browser = await chromium.launch();
  const url = new URL(BASE);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  const istToday = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  await ctx.addCookies([
    { name: "__session", value: val, domain: url.hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
    { name: "sa_gate_skip", value: istToday, domain: url.hostname, path: "/", secure: true, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // Step back to the most recent Saturday so the Wed&Sat client sections
    // (Lawrence & Mayo / Soul Storii) are due and render.
    const steps = Number(process.env.SHOOT_BACK || "0");
    for (let i = 0; i < steps; i++) {
      await page.click('button[aria-label="Previous day"]').catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);
    // expand every participant card + tray so the screenshot shows the structure
    await page.evaluate(() => {
      document.querySelectorAll("button").forEach((b) => {
        const t = (b.textContent || "").toLowerCase();
        if (/participant|this week|this month|when it happens|subject/.test(t)) (b as HTMLButtonElement).click();
      });
    }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: true });
    console.log(`✓ ${r.name} ← ${r.path}`);
  }
  await browser.close();
  console.log(`Shots in ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
