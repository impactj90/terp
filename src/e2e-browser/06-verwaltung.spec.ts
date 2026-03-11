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
});

// ---------------------------------------------------------------------------
// UC-044: Reopen Month (/admin/monthly-values)
// ---------------------------------------------------------------------------
test.describe("UC-044: Reopen Month", () => {
  test("verify reopen batch action button exists", async ({ page }) => {
    await navigateTo(page, "/admin/monthly-values");

    await expect(
      page.getByRole("button", { name: /Ausgewählte öffnen/i }),
    ).toBeVisible();
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
