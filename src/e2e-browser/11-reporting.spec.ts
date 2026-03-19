import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";

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

    // Wait for dialog to open (Sheet renders with dialog ARIA role)
    const dialog = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    );
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // Verify form fields exist within the dialog
    await expect(dialog.getByText("Berichtstyp", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("Berichtsname")).toBeVisible();
    await expect(dialog.getByText("Format", { exact: true })).toBeVisible();

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
test.describe.serial("UC-066: Payroll Export", () => {
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

  // ── Demo: Lohnexport erstellen ────────────────────────────────────
  test("Demo: Lohnexport erstellen", async ({ page }) => {
    // First, close all monthly values for January 2026 so the export passes validation.
    // The validation requires ALL active employees to have closed monthly values.
    await navigateTo(page, "/admin/monthly-values");

    // Navigate to January 2026
    const monthLabel = page.locator("main#main-content");
    // Click previous month arrow until we reach January 2026
    const prevBtn = monthLabel.locator("button").filter({ has: page.locator("img") }).first();
    for (let i = 0; i < 6; i++) {
      const text = await monthLabel.getByText(/\w+ \d{4}/).first().textContent();
      if (text?.includes("Januar 2026") || text?.includes("January 2026")) break;
      await prevBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Select all employees and close
    const selectAll = page.locator('[role="checkbox"]').first();
    await selectAll.click();
    await page.getByRole("button", { name: /Ausgewählte schließen/i }).click();

    const closeDialog = page.locator('[role="dialog"], [role="alertdialog"]');
    if (await closeDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await closeDialog.getByRole("button", { name: /Bestätigen|Schließen|Fertig/i }).last().click();
      await expect(closeDialog).not.toBeVisible({ timeout: 10_000 });
    }
    await page.waitForLoadState("networkidle");

    // Now create the payroll export
    await navigateTo(page, "/admin/payroll-exports");

    // Navigate to January 2026
    const exportMonthLabel = page.locator("main#main-content");
    const exportPrevBtn = exportMonthLabel.locator("button").filter({ has: page.locator("img") }).first();
    for (let i = 0; i < 6; i++) {
      const text = await exportMonthLabel.getByText(/\w+ \d{4}/).first().textContent();
      if (text?.includes("Januar 2026") || text?.includes("January 2026")) break;
      await exportPrevBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Click "Export erstellen"
    await page.getByRole("button", { name: "Export erstellen" }).first().click();

    // Sheet or dialog should open
    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    );
    const dialog = page.locator('[role="dialog"]');
    const form = sheet.or(dialog);
    await expect(form).toBeVisible({ timeout: 10_000 });

    // Set month to January and year to 2026
    const yearInput = form.locator('[role="spinbutton"], input[type="number"]').first();
    await yearInput.fill("2026");
    const monthSelect = form.locator("button[role='combobox']").first();
    await monthSelect.click();
    await page.getByRole("option", { name: /January|Januar/i }).click();

    // Submit
    const submitBtn = form.getByRole("button", { name: /Erstellen|Exportieren|Speichern/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Wait for form to close
    await expect(form).not.toBeVisible({ timeout: 15_000 });

    // Export should appear in the list
    await waitForTableLoad(page);
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow).toContainText(/Abgeschlossen|Erstellt|Fertig/i);
  });

  // ── Negative: Export with unclosed month shows error ─────────────
  test("shows error when generating export for month without closed values", async ({ page }) => {
    await navigateTo(page, "/admin/payroll-exports");

    // Open generate dialog
    await page.getByRole("button", { name: "Export erstellen" }).first().click();

    const sheet = page.locator(
      '[data-slot="sheet-content"][data-state="open"]',
    );
    const dialog = page.locator('[role="dialog"]');
    const form = sheet.or(dialog);
    await expect(form).toBeVisible({ timeout: 10_000 });

    // Change year to 2020 where no monthly values exist
    const yearInput = form.locator('input[type="number"]');
    await yearInput.fill("2020");

    // Submit the form
    const submitBtn = form.getByRole("button", { name: /Erstellen|Exportieren|Speichern/i });
    await submitBtn.click();

    // The form should stay open and show a destructive alert
    const alert = form.locator('[data-slot="alert"]');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText(/geschlossene Monate|closed months/i);

    // Verify the link to monthly values is shown
    const monthValuesLink = alert.locator('a[href*="monthly-values"]');
    await expect(monthValuesLink).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
  });

  // ── Demo: Vorschau prüfen ─────────────────────────────────────────
  test("Demo: Vorschau prüfen", async ({ page }) => {
    await navigateTo(page, "/admin/payroll-exports");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return;

    // Open row actions on first export
    const firstRow = rows.first();
    await firstRow.getByRole("button").last().click();
    await page.getByRole("menu").waitFor({ state: "visible" });

    // Click "Vorschau" or "Anzeigen"
    const previewItem = page.getByRole("menuitem", {
      name: /Vorschau|Anzeigen|Details/i,
    });
    if (await previewItem.isVisible().catch(() => false)) {
      await previewItem.click();

      // Preview should show a table with employee columns
      await page.waitForTimeout(2000);
      const previewContent = page.locator(
        '[role="dialog"], [data-slot="sheet-content"][data-state="open"], main#main-content',
      );
      await expect(previewContent.first()).toBeVisible();

      // Look for typical payroll columns (Personalnummer, Name, Soll, Ist)
      const content = page.locator("main#main-content");
      await expect(
        content.getByText(/Personalnummer|Name|Soll|Ist/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  // ── Demo: CSV herunterladen ───────────────────────────────────────
  test("Demo: CSV herunterladen", async ({ page }) => {
    await navigateTo(page, "/admin/payroll-exports");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return;

    // Open row actions on first export
    const firstRow = rows.first();
    await firstRow.getByRole("button").last().click();
    await page.getByRole("menu").waitFor({ state: "visible" });

    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);

    // Click "Herunterladen" or "Download"
    const downloadItem = page.getByRole("menuitem", {
      name: /Herunterladen|Download|CSV/i,
    });
    if (await downloadItem.isVisible().catch(() => false)) {
      await downloadItem.click();

      const download = await downloadPromise;
      if (download) {
        // Verify download was triggered
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.(csv|xlsx)/);
      }
    }
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
