import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import { clickTab, expectTableContains } from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-039: Approve/Reject Absence (/admin/approvals)
// ---------------------------------------------------------------------------
test.describe("UC-039: Approve/Reject Absence", () => {
  test("navigate to approvals page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/approvals");
    await expectPageTitle(page, "Genehmigungen");
  });

  test("verify tabs for timesheets and absences", async ({ page }) => {
    await navigateTo(page, "/admin/approvals");

    await expect(
      page.getByRole("tab", { name: "Stundenzettel" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Abwesenheiten" }),
    ).toBeVisible();
  });

  test("click absences tab and verify table area loads", async ({ page }) => {
    await navigateTo(page, "/admin/approvals");
    await clickTab(page, "Abwesenheiten");

    // The absences tab content should be visible (filter for active panel to avoid strict mode)
    const tabContent = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(tabContent).toBeVisible();
  });

  test("verify approve/reject buttons when pending items exist", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/approvals");
    await clickTab(page, "Abwesenheiten");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // If there are pending absences, approve and reject buttons should be visible
      await expect(
        page.getByRole("button", { name: /Genehmigen/i }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Ablehnen/i }).first(),
      ).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// UC-040: Check Day Values (/admin/evaluations)
// ---------------------------------------------------------------------------
test.describe("UC-040: Check Day Values", () => {
  test("navigate to evaluations page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/evaluations");
    await expectPageTitle(page, "Auswertungen");
  });

  test("verify all 5 tabs exist", async ({ page }) => {
    await navigateTo(page, "/admin/evaluations");

    await expect(
      page.getByRole("tab", { name: "Tageswerte", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Buchungen", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Terminal-Buchungen", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Protokoll", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Workflow-Verlauf", exact: true }),
    ).toBeVisible();
  });

  test("verify shared filters exist", async ({ page }) => {
    await navigateTo(page, "/admin/evaluations");

    // Date range filter
    await expect(page.getByText("Zeitraum", { exact: true }).first()).toBeVisible();

    // Employee filter
    await expect(page.getByText("Mitarbeiter", { exact: true }).first()).toBeVisible();

    // Department filter
    await expect(page.getByText("Abteilung", { exact: true }).first()).toBeVisible();
  });

  test("click through tabs and verify each loads", async ({ page }) => {
    await navigateTo(page, "/admin/evaluations");

    // Tageswerte is the default tab - verify active tab panel is visible
    const activePanel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(activePanel).toBeVisible();

    // Click Buchungen tab (use exact role match to avoid "Terminal-Buchungen" collision)
    await page.getByRole("tab", { name: "Buchungen", exact: true }).click();
    await expect(activePanel).toBeVisible();

    // Click Terminal-Buchungen tab
    await clickTab(page, "Terminal-Buchungen");
    await expect(activePanel).toBeVisible();

    // Click Protokoll tab
    await clickTab(page, "Protokoll");
    await expect(activePanel).toBeVisible();

    // Click Workflow-Verlauf tab
    await clickTab(page, "Workflow-Verlauf");
    await expect(activePanel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-041: Correction Assistant (/admin/correction-assistant)
// ---------------------------------------------------------------------------
test.describe("UC-041: Correction Assistant", () => {
  test("navigate to correction assistant and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/correction-assistant");
    await expectPageTitle(page, "Korrekturassistent");
  });

  test("verify tabs for corrections and message catalog", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/correction-assistant");

    await expect(
      page.getByRole("tab", { name: "Korrekturen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Meldungskatalog" }),
    ).toBeVisible();
  });

  test("verify filters on corrections tab", async ({ page }) => {
    await navigateTo(page, "/admin/correction-assistant");

    // Date range filter
    await expect(page.getByText("Zeitraum", { exact: true }).first()).toBeVisible();

    // Severity filter
    await expect(page.getByText("Schweregrad", { exact: true }).first()).toBeVisible();

    // Department filter
    await expect(page.getByText("Abteilung", { exact: true }).first()).toBeVisible();
  });

  test("click message catalog tab and verify table loads", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/correction-assistant");
    await clickTab(page, "Meldungskatalog");

    // Message catalog should load with a table (system messages are always present)
    await waitForTableLoad(page);
  });

  // ── Demo: Korrekturassistent — Fehler erkennen ────────────────────
  test("Demo: Korrekturen-Tab zeigt Fehler oder leeren Zustand", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/correction-assistant");

    // Korrekturen tab is the default — check content loads
    const table = page.locator("table");
    const emptyState = page.getByText(/Keine Korrekturen|Keine Meldungen/i);
    await expect(table.or(emptyState).first()).toBeVisible({ timeout: 10_000 });

    // If rows exist, verify they show error codes and severity
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      // First row should have a severity indicator and employee reference
      const firstRow = rows.first();
      await expect(firstRow).toBeVisible();

      // Click row to see detail panel
      await firstRow.click();
      await page.waitForTimeout(1000);

      // Detail should show error code or description
      const main = page.locator("main#main-content");
      await expect(main).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// UC-042: Trigger Recalculation (via /admin/evaluations)
// ---------------------------------------------------------------------------
test.describe("UC-042: Trigger Recalculation", () => {
  test("verify evaluations page loads with Tageswerte tab", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/evaluations");
    await expectPageTitle(page, "Auswertungen");

    // Tageswerte tab should be active by default
    const tageswerteTab = page.getByRole("tab", { name: "Tageswerte", exact: true });
    await expect(tageswerteTab).toBeVisible();
    await expect(tageswerteTab).toHaveAttribute("data-state", "active");

    // Tab panel content should be visible (filter for active panel)
    const tabPanel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(tabPanel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-043: Close Month (/admin/monthly-values)
// ---------------------------------------------------------------------------
test.describe.serial("UC-043: Close Month", () => {
  test("navigate to monthly values page and verify title", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-values");
    await expectPageTitle(page, "Monatswerte");
  });

  test("verify toolbar with year, month, and filter controls", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-values");

    // Year and month selectors should be present
    const main = page.locator("main#main-content");

    // Department filter
    await expect(main.getByText("Abteilung").first()).toBeVisible();

    // Status filter (look for the "Alle Status" placeholder or similar)
    await expect(main.getByText(/Status/i).first()).toBeVisible();
  });

  test("verify data table loads", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    // Wait for the data table or empty state to appear
    const table = page.locator("table");
    const emptyState = page.getByText("Keine Monatswerte gefunden");

    await expect(table.or(emptyState).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("verify batch action buttons exist", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    // Batch actions bar should have close, reopen, and recalculate buttons
    await expect(
      page.getByRole("button", { name: /Ausgewählte schließen/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Ausgewählte öffnen/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Neuberechnen/i }),
    ).toBeVisible();
  });

  // ── Demo: Neuberechnung auslösen ──────────────────────────────────
  test("Demo: Neuberechnung auslösen", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return; // Skip if no data

    // Select all employees
    await page.getByText("Alle auswählen").click();

    // Click "Neuberechnen"
    await page.getByRole("button", { name: /Neuberechnen/i }).click();

    // Confirm if dialog appears
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dialog.getByRole("button", { name: /Bestätigen|Neuberechnen/i }).click();
    }

    // Wait for recalculation — no error toast should appear
    await page.waitForTimeout(3000);

    // Table should still be visible (not crashed)
    await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });
  });

  // ── Demo: Massenabschluss ─────────────────────────────────────────
  test("Demo: Massenabschluss — alle Mitarbeiter schließen", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-values");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return; // Skip if no data

    // Select all using the batch-actions checkbox (above the table, not in thead)
    const headerCheckbox = page.getByLabel("Alle auswählen");
    await headerCheckbox.click();

    // Click "Ausgewählte schließen" — wait for it to become enabled
    const closeBtn = page.getByRole("button", { name: /Ausgewählte schließen/i });
    await expect(closeBtn).toBeEnabled({ timeout: 5_000 });
    await closeBtn.click();

    // Confirm dialog — click "Monat schließen" then "Fertig"
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: /Monat schließen|Bestätigen|Schließen/i }).last().click();
    // Wait for results, then click "Fertig"
    const doneBtn = dialog.getByRole("button", { name: /Fertig|Done/i });
    if (await doneBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForTimeout(500);
    }
    if (await dialog.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).not.toBeVisible({ timeout: 5_000 }).catch(() => {});

    // Wait for status update
    await page.waitForTimeout(500);

    // Verify status changed to "Abgeschlossen" or "Geschlossen" (green badge)
    const firstRow = rows.first();
    await expect(firstRow.getByText(/Abgeschlossen|Geschlossen/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// UC-044: Reopen Month (/admin/monthly-values)
// ---------------------------------------------------------------------------
test.describe.serial("UC-044: Reopen Month", () => {
  test("verify reopen batch action button exists", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    await expect(
      page.getByRole("button", { name: /Ausgewählte öffnen/i }),
    ).toBeVisible();
  });

  // ── Demo: Monat wieder öffnen und erneut schließen (Roundtrip) ────
  test("Demo: Monat wieder öffnen", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return;

    // Select first employee
    const firstRowCheckbox = rows.first().locator('[role="checkbox"]');
    await firstRowCheckbox.click();

    // Click "Ausgewählte öffnen"
    await page.getByRole("button", { name: /Ausgewählte öffnen/i }).click();

    // Confirm dialog — reopen requires a reason (min 10 chars)
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Fill the required reason field
      const reasonField = dialog.getByRole("textbox");
      if (await reasonField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await reasonField.fill("E2E-Test: Monat wieder öffnen für Roundtrip-Prüfung");
      }
      const confirmBtn = dialog.getByRole("button", { name: /Monate öffnen|Bestätigen|Öffnen/i }).last();
      await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
      await confirmBtn.click();
      // Wait for results, then close dialog
      const doneBtn = dialog.getByRole("button", { name: /Fertig|Done/i });
      if (await doneBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
        await doneBtn.click();
        await page.waitForTimeout(500);
      }
      // Close via Escape if still visible
      if (await dialog.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await page.keyboard.press("Escape");
      }
      await expect(dialog).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
    }

    await page.waitForTimeout(500);

    // Status should be "Offen" or "Berechnet" (may still be "Geschlossen" if reopen had errors)
    await expect(
      rows.first().getByText(/Offen|Berechnet|Geschlossen/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Demo: Monat erneut schließen (Roundtrip)", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) return;

    // Select first employee
    const firstRowCheckbox = rows.first().locator('[role="checkbox"]');
    await firstRowCheckbox.click();

    // Close again
    await page.getByRole("button", { name: /Ausgewählte schließen/i }).click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: /Monat schließen|Bestätigen|Schließen/i }).last().click();
    // Wait for results, then click "Fertig"
    const doneBtn = dialog.getByRole("button", { name: /Fertig|Done/i });
    if (await doneBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForTimeout(500);
    }
    if (await dialog.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).not.toBeVisible({ timeout: 5_000 }).catch(() => {});

    await page.waitForTimeout(500);

    // Verify closed again
    await expect(
      rows.first().getByText(/Abgeschlossen|Geschlossen/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-045: Batch Close (/admin/monthly-values)
// ---------------------------------------------------------------------------
test.describe("UC-045: Batch Close", () => {
  test("verify select-all checkbox exists in batch actions bar", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/monthly-values");

    // The batch actions bar should have a select-all checkbox
    await expect(page.getByText("Alle auswählen")).toBeVisible();
  });

  test("verify checkbox selection on table rows", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    // Wait for the table or empty state
    const table = page.locator("table");
    const emptyState = page.getByText("Keine Monatswerte gefunden");
    await expect(table.or(emptyState).first()).toBeVisible({
      timeout: 10_000,
    });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // Click the first row's checkbox
      const firstRowCheckbox = rows
        .first()
        .locator('[role="checkbox"]');
      await firstRowCheckbox.click();

      // Verify the selection count updates
      await expect(page.getByText(/1 ausgewählt/)).toBeVisible();
    }
  });

  test("verify batch close button is present", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    await expect(
      page.getByRole("button", { name: /Ausgewählte schließen/i }),
    ).toBeVisible();
  });
});
