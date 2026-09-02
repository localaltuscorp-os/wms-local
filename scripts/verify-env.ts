/**
 * Verifies that .env.local has every value the M2.0 auth stack needs.
 *
 * Usage:  pnpm verify:env
 *
 * Read-only. Does NOT create users, send emails, or write to the DB. Just
 * checks env-var presence + shape and dry-runs the Firebase Admin SDK init.
 * Prints a per-section checklist and exits non-zero if anything is missing
 * or still on a placeholder value from .env.local.example.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";

type Check = { ok: boolean; label: string; detail?: string };

const PLACEHOLDER_MARKERS = [
  "PASSWORD",
  "PROJECT.supabase.co",
  "demo-api-key",
  "1:000000000:web:000000",
  "firebase-adminsdk-xxxx",
  "replace_with_32_plus_random_chars",
  "re_test_xxxxxxxxxxxxxxxxxxxxxxxx",
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_MARKERS.some((m) => value.includes(m));
}

function check(label: string, value: string | undefined, validate?: (v: string) => string | null): Check {
  if (!value) return { ok: false, label, detail: "missing" };
  if (isPlaceholder(value)) return { ok: false, label, detail: "still on .env.local.example placeholder" };
  if (validate) {
    const err = validate(value);
    if (err) return { ok: false, label, detail: err };
  }
  return { ok: true, label, detail: redact(label, value) };
}

function redact(label: string, value: string): string {
  // Keep prefix + length, hide the rest, for secrets.
  if (/KEY|SECRET|TOKEN|PRIVATE/i.test(label)) {
    return `${value.slice(0, 6)}…(${value.length} chars)`;
  }
  return value;
}

function header(name: string) {
  console.log(`\n${name}`);
  console.log("─".repeat(name.length));
}

function print(checks: Check[]): { ok: number; fail: number } {
  let ok = 0;
  let fail = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    const tail = c.detail ? ` — ${c.detail}` : "";
    console.log(`  ${mark} ${c.label}${tail}`);
    c.ok ? ok++ : fail++;
  }
  return { ok, fail };
}

/**
 * M4 — "optional" section: every var in the map is checked, but missing
 * vars produce a warning (▲) rather than a failure (✗).  Returns the
 * number of WARN entries so the caller can include them in the summary
 * without bumping the non-zero exit code.
 */
function optional(
  sectionName: string,
  vars: Record<string, (v: string) => string | true>,
): { ok: number; warn: number } {
  header(`${sectionName}  (optional)`);
  let ok = 0;
  let warn = 0;
  for (const [name, validate] of Object.entries(vars)) {
    const value = process.env[name];
    if (!value) {
      console.log(`  ▲ ${name} — not set (will be skipped at runtime)`);
      warn++;
      continue;
    }
    if (isPlaceholder(value)) {
      console.log(`  ▲ ${name} — still on .env.local.example placeholder`);
      warn++;
      continue;
    }
    const result = validate(value);
    if (result === true) {
      console.log(`  ✓ ${name} — ${redact(name, value)}`);
      ok++;
    } else {
      console.log(`  ▲ ${name} — ${result}`);
      warn++;
    }
  }
  return { ok, warn };
}

async function main() {
  console.log("\nVerifying .env.local for Altus Corp Dashboard (M2.0 auth foundation)...");

  // ─── Database / Supabase ──────────────────────────────────────────
  header("Database / Supabase");
  const dbChecks = print([
    check("DATABASE_URL", process.env.DATABASE_URL, (v) =>
      v.startsWith("postgresql://") || v.startsWith("postgres://") ? null : "expected postgresql:// URI"),
    check("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL, (v) =>
      v.startsWith("https://") && v.endsWith(".supabase.co") ? null : "expected https://<ref>.supabase.co"),
    check("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, (v) =>
      v.startsWith("eyJ") ? null : "expected JWT (eyJ… prefix)"),
    check("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY, (v) =>
      v.startsWith("eyJ") ? null : "expected JWT (eyJ… prefix)"),
  ]);

  // ─── Firebase client (public) ─────────────────────────────────────
  header("Firebase Web SDK (NEXT_PUBLIC_*)");
  const fbClientChecks = print([
    check("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    check("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, (v) =>
      v.endsWith(".firebaseapp.com") ? null : "expected <project>.firebaseapp.com"),
    check("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    check("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID, (v) =>
      /^1:\d+:web:[a-f0-9]+$/i.test(v) ? null : "expected 1:<sender>:web:<hex>"),
  ]);

  // ─── Firebase Admin SDK (server) ─────────────────────────────────
  header("Firebase Admin SDK (server-only)");
  const fbAdminChecks = print([
    check("FIREBASE_PROJECT_ID", process.env.FIREBASE_PROJECT_ID),
    check("FIREBASE_CLIENT_EMAIL", process.env.FIREBASE_CLIENT_EMAIL, (v) =>
      /iam\.gserviceaccount\.com$/.test(v) ? null : "expected service-account email"),
    check("FIREBASE_PRIVATE_KEY", process.env.FIREBASE_PRIVATE_KEY, (v) =>
      v.includes("BEGIN PRIVATE KEY") ? null : "expected PEM with BEGIN/END PRIVATE KEY markers"),
  ]);

  // Live dry-run: try initializing the Admin SDK. Skipped in emulator mode.
  const emulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (fbAdminChecks.fail === 0 && !emulator) {
    try {
      if (!getApps().length) {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID!,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
            privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
          }),
        });
      }
      console.log("  ✓ Admin SDK initializes without throwing");
      fbAdminChecks.ok++;
    } catch (err: any) {
      console.log(`  ✗ Admin SDK init threw: ${err?.message ?? err}`);
      fbAdminChecks.fail++;
    }
  } else if (emulator) {
    console.log("  · skipped Admin SDK init dry-run (emulator mode detected)");
  }

  // ─── Cookie signing ──────────────────────────────────────────────
  header("Cookie signing");
  const cookieChecks = print([
    check("COOKIE_SECRET_CURRENT", process.env.COOKIE_SECRET_CURRENT, (v) =>
      v.length >= 32 ? null : `must be ≥32 chars (got ${v.length})`),
    check("COOKIE_SECRET_PREVIOUS", process.env.COOKIE_SECRET_PREVIOUS, (v) =>
      v.length >= 32 ? null : `must be ≥32 chars (got ${v.length})`),
  ]);

  // ─── Resend ──────────────────────────────────────────────────────
  header("Resend (email)");
  const resendChecks = print([
    check("RESEND_API_KEY", process.env.RESEND_API_KEY, (v) =>
      v.startsWith("re_") ? null : "expected re_ prefix"),
    check("RESEND_FROM_EMAIL", process.env.RESEND_FROM_EMAIL, (v) =>
      /<.+@.+>/.test(v) || /^.+@.+$/.test(v) ? null : "expected \"Name <addr@domain>\" or addr@domain"),
  ]);

  // ─── Site URL ────────────────────────────────────────────────────
  header("Site");
  const siteChecks = print([
    check("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, (v) =>
      v.startsWith("http://") || v.startsWith("https://") ? null : "expected http(s):// prefix"),
  ]);

  // ─── Cron (M2.3) ─────────────────────────────────────────────────
  header("Cron (daily digest)");
  const cronChecks = print([
    check("CRON_SECRET", process.env.CRON_SECRET, (v) =>
      v.length >= 16 ? null : `must be ≥16 chars (got ${v.length})`),
  ]);

  // ─── Emulator (optional) ─────────────────────────────────────────
  header("Firebase emulator (optional, dev-only)");
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log(`  · FIREBASE_AUTH_EMULATOR_HOST = ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
    console.log(`  · NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = ${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "(unset)"}`);
    console.log("  · Auth will hit the local emulator. Unset both vars for production.");
  } else {
    console.log("  · No emulator vars set — Auth will hit live Firebase.");
  }

  // ─── M4: optional multi-channel sections ─────────────────────────
  // None of these are required for the app to boot.  Missing vars
  // disable the matching channel at runtime — the dispatcher's
  // Promise.allSettled simply records "skip" for that arm.
  const slackOptional = optional("Slack (M4)", {
    SLACK_BOT_TOKEN: (v) => v.startsWith("xoxb-") || "must start with xoxb-",
  });
  const whatsappOptional = optional("WhatsApp (M4)", {
    META_WHATSAPP_PHONE_NUMBER_ID:     (v) => /^\d+$/.test(v) || "numeric ID",
    META_WHATSAPP_ACCESS_TOKEN:        (v) => v.length > 20 || "looks too short",
    META_WHATSAPP_BUSINESS_ACCOUNT_ID: (v) => /^\d+$/.test(v) || "numeric ID",
    META_WHATSAPP_VERIFY_TOKEN:        (v) => v.length > 16 || "≥16 chars",
  });
  const webPushOptional = optional("Web Push (M4)", {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: (v) => v.length > 80 || "VAPID public key",
    VAPID_PRIVATE_KEY:            (v) => v.length > 40 || "VAPID private key",
    VAPID_SUBJECT:                (v) => /^mailto:/.test(v) || "must start with mailto:",
  });

  // ─── Summary ─────────────────────────────────────────────────────
  const totalOk =
    dbChecks.ok +
    fbClientChecks.ok +
    fbAdminChecks.ok +
    cookieChecks.ok +
    resendChecks.ok +
    siteChecks.ok +
    cronChecks.ok +
    slackOptional.ok +
    whatsappOptional.ok +
    webPushOptional.ok;
  const totalFail = dbChecks.fail + fbClientChecks.fail + fbAdminChecks.fail + cookieChecks.fail + resendChecks.fail + siteChecks.fail + cronChecks.fail;
  const totalWarn =
    slackOptional.warn + whatsappOptional.warn + webPushOptional.warn;

  console.log(
    `\nSummary: ${totalOk} OK · ${totalFail} failed · ${totalWarn} optional warnings`,
  );
  if (totalFail > 0) {
    console.log("\nFix the ✗ entries in .env.local, then re-run: pnpm verify:env");
    process.exit(1);
  }
  console.log("\n✓ Environment ready. Next steps:");
  console.log("    pnpm db:migrate            # apply schema migrations");
  console.log("    pnpm bootstrap-admin -- --email <you> --name \"<You>\"");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nverify-env crashed:", err);
  process.exit(2);
});
