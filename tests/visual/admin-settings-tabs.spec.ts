import { test, expect } from "@playwright/test";

const EMULATOR_HOST = "localhost:9099";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "altus-corp-dev";

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

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", "heteshvichare927@gmail.com");
  await page.fill("#password", "dev1234");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

test.describe("M5.1 admin settings tabs", () => {
  test.beforeAll(async () => {
    const running = await emulatorRunning();
    test.skip(
      !running,
      `Firebase Auth emulator not reachable at ${EMULATOR_HOST}; skipping settings-tabs E2E (run \`pnpm emul\` + \`pnpm seed:firebase\` to enable).`,
    );
  });

  test("tab navigation updates URL and shows distinct content", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/settings");

    await expect(
      page.getByRole("heading", { name: "Organisation settings" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Statuses" }).click();
    await expect(page).toHaveURL(/tab=statuses/);
    await expect(page.getByText("Rename or recolor each status")).toBeVisible();

    await page.getByRole("tab", { name: "Integrations" }).click();
    await expect(page).toHaveURL(/tab=integrations/);
    await expect(
      page.getByText("Connection state and recent delivery counts"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Notifications" }).click();
    await expect(page).toHaveURL(/tab=notifications/);
    await expect(
      page.getByText("Pick which channels deliver each kind"),
    ).toBeVisible();
  });

  test("renaming a status persists across reload", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/settings?tab=statuses");

    // The "Need Help" row holds a text input with the current label. We
    // rename it to "Stuck", save, reload, and assert the new value
    // round-tripped. Then revert so the test is idempotent.
    const original = page.locator('input[type="text"][value="Need Help"]');
    await expect(original).toBeVisible();
    await original.fill("Stuck");

    const row = original.locator("xpath=ancestor::div[contains(@class,'grid')][1]");
    await row.getByRole("button", { name: /^Save$/ }).click();
    await expect(row.getByText("Saved")).toBeVisible({ timeout: 5_000 });

    await page.reload();
    const renamed = page.locator('input[type="text"][value="Stuck"]');
    await expect(renamed).toBeVisible();

    // Revert to keep the test idempotent.
    await renamed.fill("Need Help");
    const revertRow = page
      .locator('input[type="text"][value="Need Help"]')
      .locator("xpath=ancestor::div[contains(@class,'grid')][1]");
    await revertRow.getByRole("button", { name: /^Save$/ }).click();
    await expect(revertRow.getByText("Saved")).toBeVisible({ timeout: 5_000 });
  });
});
