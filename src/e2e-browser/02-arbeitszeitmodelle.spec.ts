import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-012: Day Plans
// ---------------------------------------------------------------------------
test.describe.serial("UC-012: Day Plans", () => {
  test("navigate to day plans page", async ({ page }) => {
    await navigateTo(page, "/admin/day-plans");
    await expectPageTitle(page, "Tagespläne");
  });

  test("create day plan E2E-DP-STD", async ({ page }) => {
    await navigateTo(page, "/admin/day-plans");
    await page.getByRole("button", { name: "Neuer Tagesplan" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-DP-STD");
    await fillInput(page, "name", "E2E Standard Tag");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-DP-STD");
  });

  test("create day plan E2E-DP-FREI", async ({ page }) => {
    await navigateTo(page, "/admin/day-plans");
    await page.getByRole("button", { name: "Neuer Tagesplan" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-DP-FREI");
    await fillInput(page, "name", "E2E Freier Tag");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-DP-FREI");
  });
});

// ---------------------------------------------------------------------------
// UC-013: Week Plans
// ---------------------------------------------------------------------------
test.describe.serial("UC-013: Week Plans", () => {
  test("navigate to week plans page", async ({ page }) => {
    await navigateTo(page, "/admin/week-plans");
    await expectPageTitle(page, "Wochenpläne");
  });

  test("create week plan E2E-WP", async ({ page }) => {
    await navigateTo(page, "/admin/week-plans");
    await page.getByRole("button", { name: "Neuer Wochenplan" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-WP");
    await fillInput(page, "name", "E2E Wochenplan");

    // All 7 day plan selectors are required
    await selectOption(page, /Montag/, /E2E-DP-STD/);
    await selectOption(page, /Dienstag/, /E2E-DP-STD/);
    await selectOption(page, /Mittwoch/, /E2E-DP-STD/);
    await selectOption(page, /Donnerstag/, /E2E-DP-STD/);
    await selectOption(page, /Freitag/, /E2E-DP-STD/);
    await selectOption(page, /Samstag/, /E2E-DP-FREI/);
    await selectOption(page, /Sonntag/, /E2E-DP-FREI/);

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-WP");
  });
});

// ---------------------------------------------------------------------------
// UC-014: Tariffs
// ---------------------------------------------------------------------------
test.describe.serial("UC-014: Tariffs", () => {
  test("navigate to tariffs page", async ({ page }) => {
    await navigateTo(page, "/admin/tariffs");
    await expectPageTitle(page, "Tarife");
  });

  test("create tariff E2E-TAR", async ({ page }) => {
    await navigateTo(page, "/admin/tariffs");
    await page.getByRole("button", { name: "Neuer Tarif" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-TAR");
    await fillInput(page, "name", "E2E Tarif");

    // Switch to Zeitplan tab and select a week plan (required for weekly rhythm)
    await clickTab(page, /Zeitplan/);
    await selectOption(page, /^Wochenplan$/, /E2E-WP/);

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-TAR");
  });
});

// ---------------------------------------------------------------------------
// UC-015: Accounts
// ---------------------------------------------------------------------------
test.describe.serial("UC-015: Accounts", () => {
  test("navigate to accounts page and verify tabs", async ({ page }) => {
    await navigateTo(page, "/admin/accounts");
    await expectPageTitle(page, "Konten");

    // Verify both tabs exist
    await expect(page.getByRole("tab", { name: "Konten" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Gruppen" })).toBeVisible();
  });

  test("verify pre-existing system accounts", async ({ page }) => {
    await navigateTo(page, "/admin/accounts");
    await waitForTableLoad(page);

    // System accounts should already be present
    const rows = page.locator("table tbody tr");
    await expect(rows).not.toHaveCount(0);
  });

  test("create account E2E-ACC", async ({ page }) => {
    await navigateTo(page, "/admin/accounts");
    await page.getByRole("button", { name: "Neues Konto" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-ACC");
    await fillInput(page, "name", "E2E Konto");

    // Select account type "Bonus" (the default "Erfassung"/tracking is not a valid API value)
    await selectOption(page, /^Typ \*$/, /Bonus/);

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-ACC");
  });
});

// ---------------------------------------------------------------------------
// UC-016: Calculation Rules
// ---------------------------------------------------------------------------
test.describe.serial("UC-016: Calculation Rules", () => {
  test("navigate to calculation rules page", async ({ page }) => {
    await navigateTo(page, "/admin/calculation-rules");
    await expectPageTitle(page, "Berechnungsregeln");
  });

  test("verify page loads with rule count", async ({ page }) => {
    await navigateTo(page, "/admin/calculation-rules");

    // The page may have no pre-existing rules; verify the count text is visible
    // (indicates data has loaded) rather than requiring table rows.
    await expect(
      page.getByText(/\d+ Regel/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create calculation rule E2E-CR", async ({ page }) => {
    await navigateTo(page, "/admin/calculation-rules");
    await page.getByRole("button", { name: "Neue Regel" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-CR");
    await fillInput(page, "name", "E2E Regel");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-CR");
  });
});
