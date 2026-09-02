/**
 * Lightweight Resend API key check. Hits Resend's GET /domains
 * endpoint to confirm the key in RESEND_API_KEY is accepted,
 * without sending any email.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/smoke-test-resend-key.ts
 */

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[smoke] RESEND_API_KEY is not set in env");
    process.exit(1);
  }

  // /domains is the cheapest list endpoint that doesn't require any
  // resource ids. 200 = valid key, 401/403 = bad key.
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`[smoke] FAILED — HTTP ${res.status}`);
    console.error(body.slice(0, 400));
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const data = parsed as { data?: Array<{ name: string; status: string; region: string }> } | null;
  const domains = data?.data ?? [];

  console.log(`[smoke] OK — key accepted by Resend.`);
  if (domains.length === 0) {
    console.log(
      `[smoke] No verified domains. Sending will work only to addresses\n` +
        `        registered on your Resend account, via the default sender\n` +
        `        onboarding@resend.dev.`,
    );
  } else {
    console.log(`[smoke] Verified domains (${domains.length}):`);
    for (const d of domains) {
      console.log(`        - ${d.name}  [status=${d.status}, region=${d.region}]`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] unexpected failure:", err);
  process.exit(1);
});
