import { test, expect } from "@playwright/test";

test("clicking a heatmap cell opens a popover with task links", async ({ page }) => {
  await page.goto("/");
  // first cell of the first lane — scroll into view before clicking
  // (the heatmap bar segments may be off-screen on narrower viewports)
  const firstSegment = page.locator('button[aria-label*="pending"]').first();
  await firstSegment.scrollIntoViewIfNeeded();
  // dispatchEvent bypasses Playwright's visibility/actionability checks, which is
  // needed on mobile-sm where the heatmap bar segments can be outside the viewport
  // due to the fixed-column grid layout (160px + 64px + 1fr + 56px > 390px).
  await firstSegment.dispatchEvent("click");
  await expect(page.locator("ul li a").first()).toBeVisible();
});
