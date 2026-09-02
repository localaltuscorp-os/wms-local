import { test, expect } from "@playwright/test";

test("clicking the Need Help KPI navigates to /tasks?status=need_help", async ({ page }) => {
  await page.goto("/");
  await page.locator("a", { hasText: "Need Help" }).first().click();
  await expect(page).toHaveURL(/\/tasks\?status=need_help/);
});
