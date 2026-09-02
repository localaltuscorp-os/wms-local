import { test, expect } from "@playwright/test";

const EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";

// Skip if the auth emulator isn't running — same pattern as auth-flow.spec.ts.
test.beforeAll(async () => {
  test.skip(
    !EMULATOR_HOST,
    "Firebase auth emulator not configured (NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST unset)",
  );
});

test.describe("M2.1 task CRUD", () => {
  test("admin creates a task via dialog, opens detail, edits the title", async ({ page }) => {
    // Pre-condition: dev seed has run AND seed-firebase has run AND
    // there's at least one admin employee.  Adjust the email if seed
    // uses a different one.
    const adminEmail = "heteshvichare927@gmail.com";

    // Step 1: Sign in
    await page.goto("/login");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "dev1234");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10_000 });

    // Step 2: Open the New Task dialog from the header
    await page.click('button:has-text("New task")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const uniqueTitle = `E2E task ${Date.now()}`;
    await page.fill("#nt-title", uniqueTitle);
    // Doer + Initiator: pick the first non-empty option
    await page.locator("#nt-doer").selectOption({ index: 1 });
    await page.locator("#nt-initiator").selectOption({ index: 1 });
    await page.click('button[type="submit"]:has-text("Create task")');

    // Step 3: Dialog closes, URL changes to /tasks/<id>
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/, { timeout: 10_000 });
    await expect(page.locator("h1", { hasText: uniqueTitle })).toBeVisible();

    // Step 4: Click Edit
    await page.click('button:has-text("Edit")');
    await expect(page.locator('h1', { hasText: "Edit task" })).toBeVisible();

    // Step 5: Change the title and save
    const renamed = `${uniqueTitle} (edited)`;
    await page.fill("#te-title", renamed);
    await page.click('button[type="submit"]:has-text("Save")');

    // Step 6: Back in read mode with the new title
    await expect(page.locator("h1", { hasText: renamed })).toBeVisible({ timeout: 10_000 });

    // Step 7: Confirm /tasks list shows the renamed task and the title links
    await page.goto("/tasks");
    const titleLink = page.locator(`a:has-text("${renamed}")`);
    await expect(titleLink).toBeVisible();
    await titleLink.click();
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/);
  });
});
