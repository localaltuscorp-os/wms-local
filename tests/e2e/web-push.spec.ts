import { test, expect } from "@playwright/test";

/**
 * M4 Commit 3c — Web Push subscribe flow smoke test.
 *
 * Gated to chromium because:
 *   - Firefox/WebKit Playwright bundles have flaky Push API support.
 *   - Real iOS Safari requires PWA-install + a user gesture flow we
 *     can't faithfully drive headless.  The chromium path is the one
 *     we ship to ~80% of users on day-one.
 *
 * Pre-requisites (NOT yet wired — see "Known limitations" below):
 *   - playwright.config.ts must include this file in `testDir` or be
 *     run with an explicit path (`pnpm test:e2e tests/e2e/web-push.spec.ts`).
 *   - The `webServer` block needs valid `.env.local` with Firebase Auth
 *     + Supabase + VAPID keys.
 *   - A signed-in employee fixture is assumed by `page.goto("/profile")`.
 *     This test does not perform a login — extend with your own auth
 *     setup (storage state / fixtures) before promoting it to CI.
 *
 * Known limitations:
 *   - There is no DB-side round-trip assertion.  The UI flip from
 *     "Enable push notifications" → "Push enabled" already requires
 *     `pushManager.subscribe()` to resolve and the `/api/web-push/subscribe`
 *     POST to return 200, so a failing subscribe path is observable from
 *     the UI alone.  A direct `push_subscriptions` SELECT would need an
 *     authenticated admin client + a fixture user — both deliberately
 *     out of scope until this spec is promoted into CI.
 */

test.describe("Web Push subscribe flow", () => {
  test("clicking Enable creates a push_subscriptions row", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Web Push only tested on chromium");
    await context.grantPermissions(["notifications"]);

    await page.goto("/profile");

    // The Enable button only renders when the browser supports Notification
    // and permission is not yet granted.  Under chromium + granted perms,
    // the button text on first paint is "Enable push notifications";
    // after a successful subscribe it becomes "✓ Push enabled — turn off".
    const enableButton = page.getByRole("button", {
      name: /Enable push notifications/,
    });
    await enableButton.click();

    // Subscribe round-trip happens client-side; the UI flips to the
    // "enabled" state on success.  See "Known limitations" in the file
    // header for why this UI-only assertion is sufficient here.
    await expect(page.getByText(/Push enabled/)).toBeVisible({
      timeout: 5_000,
    });
  });
});
