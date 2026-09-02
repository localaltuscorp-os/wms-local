// @ts-nocheck
/**
 * Authed screenshot pipeline for visual review (NOT shipped).
 * Mints a real __session for a super-admin via the app's own machinery, then
 * Playwright-screenshots the given routes against a running local server.
 *
 * Prereq: a local server on BASE (default http://localhost:3000) — `next start`.
 *   pnpm tsx --env-file=.env.local scripts/shoot-tasks.ts
 */
import { chromium } from "playwright-core";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mkdirSync } from "node:fs";

function getFirebaseAdminAuth() {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  return getAuth(app);
}

const BASE = process.env.SHOOT_BASE || "http://localhost:3000";
const UID = process.env.SHOOT_UID || "Rc4buo6UVq"; // overwritten below with full uid
const OUT = "D:/altus-dashboard/.shots";

// Full uid must be passed via env (the DB has it); fall back to Hetesh's.
const FULL_UID = process.env.SHOOT_UID_FULL;

const ROUTES: { path: string; name: string }[] = [
  { path: "/tasks", name: "01-tasks-list" },
  { path: "/tasks/kanban", name: "03-kanban" },
  { path: "/tasks/new", name: "04-new-task" },
];

async function mintSessionCookie(uid: string): Promise<{ name: string; value: string }> {
  const auth = getFirebaseAdminAuth();
  const customToken = await auth.createCustomToken(uid);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
  // custom token → idToken
  const exch = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const exj = (await exch.json()) as { idToken?: string; error?: unknown };
  if (!exj.idToken) throw new Error(`signInWithCustomToken failed: ${JSON.stringify(exj.error ?? exj)}`);
  // idToken → __session cookie via the app's own endpoint
  const sess = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: exj.idToken }),
  });
  const setCookie = sess.headers.get("set-cookie");
  if (!setCookie) throw new Error(`/api/auth/session returned no Set-Cookie (status ${sess.status})`);
  const m = /__session=([^;]+)/.exec(setCookie);
  if (!m) throw new Error(`no __session in Set-Cookie: ${setCookie.slice(0, 120)}`);
  return { name: "__session", value: m[1]! };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const uid = FULL_UID;
  if (!uid) throw new Error("Set SHOOT_UID_FULL to the super-admin firebase_uid.");
  console.log(`Minting session for uid ${uid.slice(0, 8)}… against ${BASE}`);
  const cookie = await mintSessionCookie(uid);
  console.log("✓ __session minted");

  const browser = await chromium.launch();
  const url = new URL(BASE);
  const ctx = await browser.newContext({
    viewport: { width: 1512, height: 950 },
    deviceScaleFactor: 2,
  });
  // Super-admin "skip gates for today" cookie = today's IST date (bypasses the
  // planning / DCC-review gates so the shooter lands on the real page).
  const istToday = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  await ctx.addCookies([
    { name: cookie.name, value: cookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "sa_gate_skip", value: istToday, domain: url.hostname, path: "/", sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();

  // Robust load: wait until CSS is actually applied (cold `next start` can race)
  // AND the error boundary ("That didn't go through" — a transient DB blip) is
  // not showing; retry the goto a few times if either is off.
  async function gotoReady(path: string): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {});
      await page.waitForTimeout(700);
      const state = await page.evaluate(() => {
        const hasCss = Array.from(document.styleSheets).some((s) => {
          try { return (s.cssRules?.length ?? 0) > 5; } catch { return true; }
        });
        const font = getComputedStyle(document.body).fontFamily || "";
        const styled = hasCss && !/times|^serif/i.test(font);
        const err = /didn't go through/i.test(document.body.innerText);
        return { styled, err };
      });
      if (state.err) { await page.waitForTimeout(1800); continue; } // transient → retry
      if (state.styled) { await page.waitForTimeout(900); return true; }
      await page.waitForTimeout(1200);
    }
    return false;
  }

  // Warm-up pass (compile route + prime DB pool) then the real screenshot pass.
  for (const r of ROUTES) await gotoReady(r.path);
  for (const r of ROUTES) {
    try {
      const ok = await gotoReady(r.path);
      await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: true });
      console.log(`${ok ? "✓" : "⚠ (unstyled/err)"} ${r.name}  ← ${r.path}`);
    } catch (e) {
      console.error(`✗ ${r.name} (${r.path}): ${(e as Error).message}`);
    }
  }
  await browser.close();
  console.log(`\nShots in ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
void UID;
