import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("header renders brand mark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Altus").first()).toBeAttached();
  });

  test("renders either the welcome hero or the populated 6 sections", async ({
    page,
  }) => {
    await page.goto("/");

    const welcome = page.locator("text=Welcome.").first();
    const kpiLabel = page.locator("text=Total").first();

    // Wait until either branch is in the DOM.
    await Promise.race([
      welcome.waitFor({ state: "attached", timeout: 10_000 }),
      kpiLabel.waitFor({ state: "attached", timeout: 10_000 }),
    ]);

    const isEmpty = (await welcome.count()) > 0;

    if (isEmpty) {
      await expect(welcome).toBeAttached();
      await expect(page.locator("text=No data yet.")).toBeAttached();
      await expect(
        page.locator("text=Open Supabase Studio").first(),
      ).toBeAttached();
      await expect(
        page.locator("text=Read-only in M1.5.").first(),
      ).toBeAttached();
    } else {
      await expect(kpiLabel).toBeAttached();
      await expect(page.locator("text=Task Velocity").first()).toBeAttached();
      await expect(
        page.locator("text=Status Distribution").first(),
      ).toBeAttached();
      await expect(
        page.locator("text=Top Performers").first(),
      ).toBeAttached();
      await expect(page.locator("text=Aging Heatmap").first()).toBeAttached();
    }
  });

  test("footer renders Altus Corp credits", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("text=Altus Corp").first();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
  });
});
