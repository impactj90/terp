import { test, expect } from "@playwright/test";
import { navigateTo, expectPageTitle } from "./helpers/nav";

// ---------------------------------------------------------------------------
// UC-063: Generate Report
// ---------------------------------------------------------------------------
test.describe("UC-063: Generate Report", () => {
  test("navigate to reports page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/reports");
    await expectPageTitle(page, "Berichte");
  });

  test("open generate report dialog and verify form fields", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/reports");

    await page.getByRole("button", { name: "Bericht erstellen" }).click();

    // Wait for dialog to open
    const dialog = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    );
    await dialog.waitFor({ state: "visible" });

    // Verify form fields exist
    await expect(page.getByText("Berichtstyp", { exact: true })).toBeVisible();
    await expect(page.getByText("Berichtsname")).toBeVisible();
    await expect(page.getByText("Format", { exact: true })).toBeVisible();

    // Close dialog without submitting
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-064: Download Report
// ---------------------------------------------------------------------------
test.describe("UC-064: Download Report", () => {
  test("verify report table and download action availability", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/reports");
    await expectPageTitle(page, "Berichte");

    // Check if reports exist in the table
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // If reports exist, verify row actions include download
      const firstRow = rows.first();
      await firstRow.getByRole("button").last().click();
      await page.getByRole("menu").waitFor({ state: "visible" });

      await expect(
        page.getByRole("menuitem", { name: /Download|Herunterladen/ }),
      ).toBeVisible();

      // Close the menu
      await page.keyboard.press("Escape");
    }
  });
});

// ---------------------------------------------------------------------------
// UC-065: Export Interface
// ---------------------------------------------------------------------------
test.describe("UC-065: Export Interface", () => {
  test("navigate to export interfaces page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/export-interfaces");
    await expectPageTitle(page, "Exportschnittstellen");
  });

  test("open create form and close without submitting", async ({ page }) => {
    await navigateTo(page, "/admin/export-interfaces");

    await page
      .getByRole("button", { name: "Neue Schnittstelle" })
      .click();

    // Wait for sheet to open
    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    );
    await sheet.waitFor({ state: "visible" });

    // Close without submitting
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-066: Payroll Export
// ---------------------------------------------------------------------------
test.describe("UC-066: Payroll Export", () => {
  test("navigate to payroll exports page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/payroll-exports");
    await expectPageTitle(page, "Lohnexporte");
  });

  test("verify toolbar with export button and filters", async ({ page }) => {
    await navigateTo(page, "/admin/payroll-exports");

    // Verify export button exists (two may exist: header + empty state)
    await expect(
      page.getByRole("button", { name: "Export erstellen" }).first(),
    ).toBeVisible();

    // Verify toolbar filters exist (month picker with nav arrows, status dropdown)
    const toolbar = page.locator("main#main-content");
    // Month picker shows current month/year (e.g. "Maerz 2026" or "März 2026")
    await expect(toolbar.getByText(/20\d{2}/)).toBeVisible();
    // Status dropdown
    await expect(toolbar.getByText(/Status/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-067: Evaluation Templates
// ---------------------------------------------------------------------------
test.describe("UC-067: Evaluation Templates", () => {
  test("navigate to monthly evaluations page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-evaluations");
    await expectPageTitle(page, "Auswertungsvorlagen");
  });

  test("verify page loads with templates or empty state", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-evaluations");

    const main = page.locator("main#main-content");

    // The page should show either a table with templates or an empty state
    const table = main.locator("table");
    const emptyState = main.getByText("Keine Auswertungsvorlagen konfiguriert");

    // Wait for either the table or empty state to appear
    await expect(
      table.or(emptyState),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("open create form and close without submitting", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-evaluations");

    await page.getByRole("button", { name: "Neue Vorlage" }).click();

    // Wait for sheet to open
    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    );
    await sheet.waitFor({ state: "visible" });

    // Close without submitting
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 5_000 });
  });
});
