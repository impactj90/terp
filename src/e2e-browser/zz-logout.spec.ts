import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";

// ---------------------------------------------------------------------------
// UC-004: Logout (MUST BE LAST — signOut invalidates server-side session)
// ---------------------------------------------------------------------------
test.describe("UC-004: Logout", () => {
  test("logout and verify redirect to login", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Open user menu and click logout
    await page
      .getByRole("button", { name: /open user menu|Benutzermenü öffnen/i })
      .click();
    await page.getByRole("menuitem", { name: /Sign out|Abmelden/i }).click();

    // Verify redirect to login page
    await page.waitForURL("**/login", { timeout: 10_000 });
    await expect(page.locator("#email")).toBeVisible();
  });
});
