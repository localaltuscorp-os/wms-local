import { test, expect } from "@playwright/test";

// The primary nav pills are desktop-only (hidden via max-md:hidden on mobile).
// Skip both tests on the mobile-sm project to avoid false negatives.
test.skip(
  ({ viewport }) => (viewport?.width ?? 1440) < 768,
  "Nav pills are hidden on mobile viewports",
);

test("main nav: active state moves with route", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('a[aria-current="page"]').filter({ hasText: "Dashboard" }),
  ).toBeVisible();

  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('a[aria-current="page"]').filter({ hasText: "Tasks" }),
  ).toBeVisible();

  await page.goto("/archived", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('a[aria-current="page"]').filter({ hasText: "Archived" }),
  ).toBeVisible();
});

test("main nav: live counts render", async ({ page }) => {
  await page.goto("/");
  // The Tasks pill should have a count badge with a positive number.
  const tasksPill = page.locator("nav a", { hasText: "Tasks" }).first();
  const countText = await tasksPill.locator("span.nav-pill-count").innerText();
  expect(Number(countText.replace(/[^\d]/g, ""))).toBeGreaterThan(0);
});
