import { test, expect } from "@playwright/test";

const EMULATOR_HOST = "localhost:9099";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "altus-corp-dev";

// Helper: fetch the most recent oobCode for an email from the emulator
async function fetchInviteLink(email: string): Promise<string> {
  const res = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
  );
  const data = (await res.json()) as { oobCodes?: Array<{ email?: string; oobLink?: string }> };
  const codes = (data.oobCodes ?? []).filter((c) => c.email === email);
  if (codes.length === 0) throw new Error(`No oob code for ${email}`);
  const latest = codes[codes.length - 1];
  if (!latest?.oobLink) throw new Error(`No oobLink on latest code for ${email}`);
  return latest.oobLink;
}

// Detect whether the Firebase Auth emulator is reachable. If not, the entire
// describe block is skipped — CI does NOT start the emulator, so this spec is
// dev/local-only.
async function emulatorRunning(): Promise<boolean> {
  try {
    const res = await fetch(
      `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/config`,
      { signal: AbortSignal.timeout(1500) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

test.describe("M2.0 auth flow", () => {
  test.beforeAll(async () => {
    const running = await emulatorRunning();
    test.skip(
      !running,
      `Firebase Auth emulator not reachable at ${EMULATOR_HOST}; skipping auth-flow E2E (run \`pnpm emul\` + \`pnpm seed:firebase\` to enable).`,
    );
  });

  test("admin invites a user; user signs up via invite link", async ({
    page,
    browser,
  }) => {
    // Pre-condition: dev seed has run AND seed-firebase has run AND one of the
    // seeded employees is_admin=true.  We use that employee here.
    const adminEmail = "heteshvichare927@gmail.com"; // adjust to your seed
    const newEmail = `e2e-${Date.now()}@altuscorp.test`;
    const newName = "Test Newhire";

    // Step 1: Admin signs in
    await page.goto("/login");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "dev1234");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10_000 });

    // Step 2: Admin opens /admin/employees and invites a new user
    await page.goto("/admin/employees");
    await page.click("text=Invite employee");
    await page.fill(
      'label:has-text("Full name") + input, label:has-text("Full name") input',
      newName,
    );
    await page.fill(
      'label:has-text("Work email") + input, label:has-text("Work email") input',
      newEmail,
    );
    await page.click('button:has-text("Send invite")');

    // Wait for the dialog to close (transition pending → done)
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10_000 });

    // Step 3: Fetch the oobCode from the emulator and reconstruct our own link
    const emulatorLink = await fetchInviteLink(newEmail);
    const url = new URL(emulatorLink);
    const oobCode = url.searchParams.get("oobCode");
    expect(oobCode).toBeTruthy();

    // Step 4: Open a fresh context (as the invited user) and visit /set-password
    const ctx = await browser.newContext();
    const userPage = await ctx.newPage();
    await userPage.goto(`/set-password?oobCode=${oobCode}`);

    // Step 5: We should be on /set-password
    await expect(userPage).toHaveURL(/\/set-password/, { timeout: 10_000 });

    // Step 6: Set password
    await userPage.fill("#pw", "newuser1234");
    await userPage.fill("#confirm", "newuser1234");
    await userPage.click('button:has-text("Save and sign in")');

    // Step 7: Should land straight on the dashboard — the welcome/celebration
    // interstitial was removed (every login now lands on the destination).
    await expect(userPage).toHaveURL("/", { timeout: 10_000 });

    await ctx.close();
  });
});
