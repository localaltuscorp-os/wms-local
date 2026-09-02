import { test, expect } from "@playwright/test";

test("tasks page renders the table", async ({ page }) => {
  await page.goto("/tasks", { waitUntil: "networkidle" });
  await expect(page.locator("h1", { hasText: "Tasks" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  // Take a viewport screenshot (not fullPage) to avoid sticky-element duplication
  // artifacts from Playwright's scroll-stitch approach. Mask the dynamic header
  // elements (live-indicator state, auto-updating timestamp) for stability.
  await expect(page).toHaveScreenshot("tasks-page.png", {
    animations: "disabled",
    mask: [page.locator("header"), page.locator("text=Updated")],
    timeout: 30_000,
  });
});

test("tasks page filtered by need_help", async ({ page }) => {
  await page.goto("/tasks?status=need_help");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  // Every visible row should have status pill "Need Help".
  const pills = await page.locator("table tbody tr td:nth-child(6) span").allTextContents();
  for (const t of pills) expect(t.trim()).toBe("Need Help");
});
