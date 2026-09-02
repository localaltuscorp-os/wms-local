import { test, expect } from "@playwright/test";

// Row-actions use a wide horizontal table with a Radix Dropdown portal.
// The interaction is not reliable on narrow touch viewports — skip mobile.
test.skip(
  ({ viewport }) => (viewport?.width ?? 1440) < 768,
  "Row actions require desktop viewport",
);

test("archive flow: /tasks → /archived", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });

  const firstRow = page.locator("table tbody tr").first();
  const titleText = await firstRow.locator("td").first().innerText();

  const actionsBtn = firstRow.locator('button[aria-label^="Actions for"]');
  await actionsBtn.click();
  await page.getByRole("menuitem", { name: /^Archive$/ }).click();

  // Wait for the row to disappear from /tasks.
  // router.refresh() is called inside the server-action transition so the RSC
  // re-renders without this row once the DB write completes.
  // Allow up to 30 s for the DB write + RSC refresh over the network.
  await expect(firstRow).not.toContainText(titleText, { timeout: 30_000 });

  // Confirm it appears on /archived.
  await page.goto("/archived", { waitUntil: "domcontentloaded" });
  await expect(page.locator("table tbody")).toContainText(titleText, { timeout: 20_000 });
});
