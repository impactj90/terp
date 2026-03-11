import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-056: Create Order
// ---------------------------------------------------------------------------
test.describe.serial("UC-056: Create Order", () => {
  test("navigate to orders page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/orders");
    await expectPageTitle(page, "Aufträge");
  });

  test("has Aufträge and Tätigkeiten tabs", async ({ page }) => {
    await navigateTo(page, "/admin/orders");

    await expect(page.getByRole("tab", { name: "Aufträge" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tätigkeiten" })).toBeVisible();
  });

  test("create order E2E-ORD", async ({ page }) => {
    await navigateTo(page, "/admin/orders");

    // Ensure Aufträge tab is active
    await clickTab(page, "Aufträge");

    // Two "Neuer Auftrag" buttons exist (header + empty state). Use first().
    await page.getByRole("button", { name: "Neuer Auftrag" }).first().click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-ORD");
    await fillInput(page, "name", "E2E Auftrag");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-ORD");
  });
});

// ---------------------------------------------------------------------------
// UC-057: Assign Employee to Order
// ---------------------------------------------------------------------------
test.describe.serial("UC-057: Order Detail – Employee Assignment", () => {
  test("navigate to order detail page", async ({ page }) => {
    await navigateTo(page, "/admin/orders");
    await clickTab(page, "Aufträge");
    await waitForTableLoad(page);

    // Click on the E2E-ORD row to navigate to the detail page
    const row = page.locator("table tbody tr").filter({ hasText: "E2E-ORD" });
    await row.click();

    // Wait for navigation to the detail page
    await page.waitForURL(/\/admin\/orders\/.+/);
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify the detail page loaded with the order name
    await expect(
      page.locator("main#main-content").getByRole("heading", { name: "E2E Auftrag" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-058: Order Booking
// ---------------------------------------------------------------------------
test.describe.serial("UC-058: Order Booking", () => {
  test("order detail page has relevant sections", async ({ page }) => {
    await navigateTo(page, "/admin/orders");
    await clickTab(page, "Aufträge");
    await waitForTableLoad(page);

    // Navigate to the E2E-ORD detail page
    const row = page.locator("table tbody tr").filter({ hasText: "E2E-ORD" });
    await row.click();

    await page.waitForURL(/\/admin\/orders\/.+/);
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Wait for the detail page to fully load (skeleton → content)
    const mainContent = page.locator("main#main-content");
    await expect(
      mainContent.getByRole("heading", { name: "E2E Auftrag" }),
    ).toBeVisible({ timeout: 10_000 });

    // Verify tabs exist on the order detail page
    await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Zuweisungen" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Buchungen" })).toBeVisible();
  });
});
