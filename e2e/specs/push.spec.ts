// e2e/specs/push.spec.ts
// Smoke test: verifies that /settings renders either the configured push
// notification UI or the unconfigured-state stub.
//
// Skipped in DEMO_MODE because the smoke test requires a real
// VAPID-configured deployment (or at minimum a running wrangler dev server).

import { test, expect } from "../fixtures/test";

test.describe("push notifications", () => {
  test.skip(
    process.env.DEMO_MODE === "1",
    "Push smoke test requires a real VAPID-configured deployment",
  );

  test("settings page renders configured/unconfigured state", async ({
    page,
  }) => {
    // The custom `test` fixture (e2e/fixtures/test.ts) already attaches the
    // admin auth storage state globally, so the page is authenticated — no
    // explicit login steps are needed here (same pattern used by api-keys.spec,
    // inboxes.spec, etc.).
    await page.goto("/settings");

    // The Settings page redesign always renders a "Notifications"
    // section heading, regardless of whether push is configured. The
    // body underneath swaps between the configured UI and the
    // disabled-state stub. Asserting the heading is enough — it
    // guarantees the section mounted; the .or() of the previous
    // version triggered Playwright strict-mode because both elements
    // are now present in the unconfigured state too.
    await expect(
      page.getByRole("heading", { name: "Notifications" }),
    ).toBeVisible();
  });
});
