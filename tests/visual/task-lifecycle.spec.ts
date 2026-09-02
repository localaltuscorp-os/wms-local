import { test, expect } from "@playwright/test";

const EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";

test.beforeAll(async () => {
  test.skip(
    !EMULATOR_HOST,
    "Firebase auth emulator not configured (NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST unset)",
  );
});

test.describe("M2.2 task lifecycle", () => {
  test("create → forward through pending lane → mark done → approve → see timeline", async ({ page }) => {
    // Pre-condition: dev seed + seed-firebase have run.
    const adminEmail = "heteshvichare927@gmail.com";

    // Step 1: Sign in
    await page.goto("/login");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "dev1234");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10_000 });

    // Step 2: Create a task via the header dialog
    await page.click('button:has-text("New task")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    const title = `Lifecycle E2E ${Date.now()}`;
    await page.fill("#nt-title", title);
    await page.locator("#nt-doer").selectOption({ index: 1 });
    await page.locator("#nt-initiator").selectOption({ index: 1 });
    await page.click('button[type="submit"]:has-text("Create task")');
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/, { timeout: 10_000 });
    await expect(page.locator("h1", { hasText: title })).toBeVisible();

    // Step 3: Confirm AuditFeed shows the "created" event
    await expect(page.locator("section", { hasText: "Activity" })).toBeVisible();
    await expect(page.locator("section", { hasText: "Activity" })).toContainText("created");

    // Step 4: Mark done — admin acts as doer via the row-action menu on the list page.
    // For the simple lifecycle test we re-use the detail page actions; the
    // exact button label is "Mark done" inside the status menu in the
    // row-action popover.  Navigate to the list to pick it up.
    await page.goto("/tasks");
    const rowTitle = page.locator(`a:has-text("${title}")`);
    await expect(rowTitle).toBeVisible();
    // Open the row-action popover for that row
    await rowTitle.locator("..").locator("..").locator('button[aria-label="Row actions"]').click();
    await page.click('text=/^Mark done$/');

    // Step 5: Re-open detail; expect status=Done and Approve/Decline visible
    await rowTitle.click();
    await expect(page.locator("h1", { hasText: title })).toBeVisible();
    await expect(page.locator("text=/Done/")).toBeVisible();
    await expect(page.locator('button:has-text("Approve")')).toBeVisible();

    // Step 6: Approve
    await page.click('button:has-text("Approve")');

    // Step 7: Confirm status=Approved + audit feed shows status_changed → approved
    await expect(page.locator("text=/Approved/").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("section", { hasText: "Activity" })).toContainText("approved");

    // Step 8: Post a comment
    await page.fill("#ci-body", "All good.");
    await page.click('button:has-text("Post comment")');
    await expect(page.locator("text=All good.")).toBeVisible({ timeout: 10_000 });
  });
});
