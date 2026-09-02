import { test, expect } from "@playwright/test";

test("archived page renders archived tasks", async ({ page }) => {
  await page.goto("/archived");
  await expect(page.locator("h1", { hasText: "Archived" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
});
