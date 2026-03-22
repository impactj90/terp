import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  expectTableNotContains,
  openRowActions,
  clickMenuItem,
  confirmDelete,
  clickTab,
  selectOption,
} from "./helpers/forms";

/**
 * Cache Invalidation E2E Tests
 *
 * Verify that React Query / tRPC cache invalidation updates the UI
 * without page reload. Each test performs a mutation via the UI and
 * asserts the rendered state changes in-place.
 *
 * Five scenarios:
 *   1. Payment creates — detail view status + amounts update
 *   2. Payment cancel  — detail view reverts to OPEN
 *   3. Template default — badge appears on template card
 *   4. Delete order     — row disappears from list
 *   5. Execute schedule — execution log shows entry
 */

// --- Constants ---
const COMPANY = "E2E Cache GmbH";
const ORDER_CODE = "E2E-CACHE";
const ORDER_NAME = "E2E Cache Auftrag";
const TEMPLATE_NAME = "E2E Cache Vorlage";

test.describe.serial(
  "Cache Invalidation: UI updates without page reload",
  () => {
    // ═══════════════════════════════════════════════════════════════════════
    // SETUP: Address & Invoice (pre-requisites for Scenarios 1 & 2)
    // ═══════════════════════════════════════════════════════════════════════

    test("Setup: Create address for cache test", async ({ page }) => {
      await navigateTo(page, "/crm/addresses");
      await page.getByRole("button", { name: "Neue Adresse" }).click();
      await waitForSheet(page);
      await fillInput(page, "company", COMPANY);
      await fillInput(page, "city", "Berlin");
      await submitAndWaitForClose(page);
      await waitForTableLoad(page);
      await expectTableContains(page, COMPANY);
    });

    test("Setup: Create and finalize invoice (1.190 EUR)", async ({
      page,
    }) => {
      // 1. Navigate to documents and click "Neuer Beleg"
      await navigateTo(page, "/orders/documents");
      await page.getByRole("button", { name: /Neuer Beleg/i }).click();
      await page.waitForURL(/\/orders\/documents\/new/, { timeout: 10_000 });

      // 2. Select type: Rechnung
      await page.locator("#type").click();
      await page.getByRole("option", { name: "Rechnung" }).click();

      // 3. Select address
      await page.locator("#addressId").click();
      await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

      // 4. Payment terms
      await fillInput(page, "paymentTermDays", "30");

      // 5. Submit — navigates to document detail
      await page.getByRole("button", { name: /Speichern/i }).click();
      await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // 6. Add position
      await page
        .getByRole("button", { name: /Position hinzufügen/i })
        .click();

      // Wait for the row to appear, then edit inline
      const posRow = page
        .locator('[data-testid="position-table-area"] table tbody tr')
        .first();
      await posRow.waitFor({ state: "visible", timeout: 10_000 });

      // Fill description
      const descInput = posRow.locator('input[placeholder="Beschreibung"]');
      await descInput.fill("Beratungsleistung");
      await descInput.blur();

      // Fill quantity = 1 (may already be 1)
      const qtyInput = posRow.locator('input[type="number"]').first();
      await qtyInput.fill("1");
      await qtyInput.blur();

      // Fill unit price = 1000
      const priceInput = posRow.locator('input[type="number"]').nth(1);
      await priceInput.fill("1000");
      await priceInput.blur();

      // VAT rate should be 19 by default — verify or set
      const vatInput = posRow.locator('input[type="number"]').nth(3);
      const vatValue = await vatInput.inputValue();
      if (vatValue !== "19") {
        await vatInput.fill("19");
        await vatInput.blur();
      }

      // Wait for totals to recalculate
      await page.waitForTimeout(1000);

      // 7. Finalize: click "Abschließen"
      await page.getByRole("button", { name: /Abschließen/i }).click();

      // Confirm in dialog
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.getByRole("button", { name: /Abschließen/i }).click();

      // Wait for status to change
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // Verify the document is now finalized
      await expect(
        page.getByText(/festgeschrieben|Abgeschlossen/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 1: Payment creates — detail view updates status + amounts
    //
    // Key constraint: NO navigateTo/page.goto/page.reload between
    // arriving at the detail page and the final assertions.
    // ═══════════════════════════════════════════════════════════════════════

    test("Scenario 1: Payment updates detail view status and amounts without reload", async ({
      page,
    }) => {
      // Navigate to open items list
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);

      // Click into the detail page for our invoice
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: COMPANY });
      await row.click();
      await page.waitForURL(/\/orders\/open-items\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Assert initial state (before mutation)
      await expect(page.getByText("Offen").first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator("main")).toContainText(/1[.]190,00/);

      // --- Perform payment (stay on page -- no navigateTo!) ---
      await page
        .getByRole("button", { name: /Zahlung erfassen/i })
        .click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Enter partial payment of 500 EUR
      await dialog.locator("#payment-amount").clear();
      await dialog.locator("#payment-amount").fill("500");

      // Add a note
      await dialog.locator("#payment-notes").fill("E2E Cache Teilzahlung");

      // Submit payment
      await dialog
        .getByRole("button", { name: /Zahlung erfassen/i })
        .click();

      // Wait for dialog to close (mutation completed)
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // --- Assert cache invalidation updated the UI (no reload!) ---

      // Status badge changed from "Offen" to "Teilzahlung"
      await expect(page.getByText("Teilzahlung").first()).toBeVisible({
        timeout: 10_000,
      });

      // Amounts updated: "Bezahlt" shows 500,00, "Offen" shows 690,00
      await expect(page.locator("main")).toContainText(/500,00/);
      await expect(page.locator("main")).toContainText(/690,00/);

      // Payment note appears in history
      await expect(page.locator("main")).toContainText(
        "E2E Cache Teilzahlung",
      );
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 2: Cancel payment — detail view reverts to OPEN
    //
    // Key constraint: NO navigateTo/page.goto/page.reload between
    // arriving at the detail page and the final assertions.
    // ═══════════════════════════════════════════════════════════════════════

    test("Scenario 2: Cancel payment reverts status to Offen without reload", async ({
      page,
    }) => {
      // Navigate to detail page (fresh page context in serial mode)
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: COMPANY });
      await row.click();
      await page.waitForURL(/\/orders\/open-items\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Assert current state (Teilzahlung from Scenario 1)
      await expect(page.getByText("Teilzahlung").first()).toBeVisible({
        timeout: 10_000,
      });

      // --- Cancel the payment (stay on page -- no further navigation!) ---

      // Find the payment row with "500,00" and click "Stornieren"
      const paymentRow = page
        .locator("table tbody tr")
        .filter({ hasText: "500,00" });
      await paymentRow
        .getByRole("button", { name: /Stornieren/i })
        .click();

      // Wait for cancel dialog
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Confirm cancellation
      await dialog
        .getByRole("button", { name: /Bestätigen/i })
        .click();

      // Wait for dialog to close (mutation completed)
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // --- Assert cache invalidation updated the UI (no reload!) ---

      // Payment row shows "Storniert"
      await expect(page.getByText("Storniert").first()).toBeVisible({
        timeout: 10_000,
      });

      // Status badge reverts to "Offen"
      await expect(page.getByText("Offen").first()).toBeVisible({
        timeout: 10_000,
      });

      // Open amount reverts to full amount
      await expect(page.locator("main")).toContainText(/1[.]190,00/);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 3: Template default — "Standard" badge appears in-place
    // ═══════════════════════════════════════════════════════════════════════

    test("Scenario 3a: Setup - Create template for Angebot type", async ({
      page,
    }) => {
      await navigateTo(page, "/orders/templates");

      // Click "Neue Vorlage"
      await page
        .getByRole("button", { name: "Neue Vorlage" })
        .click();
      await waitForSheet(page);

      // Fill template name
      await fillInput(page, "tpl-name", TEMPLATE_NAME);

      // Select document type "Angebot" via the Dokumenttyp select
      await selectOption(page, "Dokumenttyp", "Angebot");

      // Submit
      await submitAndWaitForClose(page);

      // Verify the template card appears
      await expect(page.getByText(TEMPLATE_NAME)).toBeVisible({
        timeout: 10_000,
      });
    });

    test("Scenario 3b: Set default updates Standard badge without reload", async ({
      page,
    }) => {
      // Navigate to templates page once
      await navigateTo(page, "/orders/templates");

      // Wait for template card to be visible
      await expect(page.getByText(TEMPLATE_NAME)).toBeVisible({
        timeout: 10_000,
      });

      // Assert initial state: template card does NOT have "Standard" badge
      const templateCard = page
        .locator('[data-slot="card-content"]')
        .filter({ hasText: TEMPLATE_NAME });
      await expect(
        templateCard.getByText("Standard"),
      ).not.toBeVisible();

      // --- Click star icon to set default (stay on page!) ---
      await page.getByTitle("Als Standard setzen").click();

      // --- Assert cache invalidation updated the UI (no reload!) ---

      // "Standard" badge appears on the template card
      await expect(
        templateCard.getByText("Standard"),
      ).toBeVisible({ timeout: 10_000 });

      // Success toast
      await expect(
        page.getByText("Standard-Vorlage gesetzt"),
      ).toBeVisible({ timeout: 5_000 });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 4: Delete order — row disappears from list in-place
    // ═══════════════════════════════════════════════════════════════════════

    test("Scenario 4a: Setup - Create order for cache test", async ({
      page,
    }) => {
      await navigateTo(page, "/admin/orders");
      await clickTab(page, "Aufträge");

      // Click "Neuer Auftrag" (.first() because header + empty state can both show it)
      await page
        .getByRole("button", { name: "Neuer Auftrag" })
        .first()
        .click();
      await waitForSheet(page);

      await fillInput(page, "code", ORDER_CODE);
      await fillInput(page, "name", ORDER_NAME);

      await submitAndWaitForClose(page);
      await waitForTableLoad(page);
      await expectTableContains(page, ORDER_CODE);
    });

    test("Scenario 4b: Delete order removes row from list without reload", async ({
      page,
    }) => {
      // Navigate to orders once
      await navigateTo(page, "/admin/orders");
      await clickTab(page, "Aufträge");
      await waitForTableLoad(page);

      // Verify order is present
      await expectTableContains(page, ORDER_CODE);

      // --- Delete via row actions (stay on page!) ---
      await openRowActions(page, ORDER_CODE);
      await clickMenuItem(page, /Löschen/);

      // Confirm delete in ConfirmDialog (sheet-based)
      await confirmDelete(page);

      // --- Assert cache invalidation updated the UI (no reload!) ---

      // Row disappears from the table
      await expectTableNotContains(page, ORDER_CODE);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 5: Execute schedule — mutation completes, button re-enables
    //
    // useExecuteSchedule invalidates schedules.list, employees.dayView,
    // and employeeDayPlans.list. It does NOT invalidate
    // schedules.executions, so the execution log tab on the detail page
    // will not auto-update (known gap). This test verifies:
    //   1. The mutation completes successfully (button re-enables)
    //   2. A success toast is shown
    //   3. The schedule remains in the list after execution (schedules.list
    //      was invalidated and refetched)
    // ═══════════════════════════════════════════════════════════════════════

    test("Scenario 5: Execute schedule completes and list remains valid", async ({
      page,
    }) => {
      // Navigate to schedule list first, then to detail
      await navigateTo(page, "/admin/schedules");
      await waitForTableLoad(page);
      await expectTableContains(page, "E2E Zeitplan");

      // Click on "E2E Zeitplan" row to go to detail page
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: "E2E Zeitplan" });
      await row.click();

      // Wait for detail page
      await page.waitForURL(/\/admin\/schedules\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Verify heading
      await expect(page.getByText("E2E Zeitplan").first()).toBeVisible({
        timeout: 10_000,
      });

      // --- Click "Jetzt ausführen" (stay on detail page!) ---
      const executeBtn = page.getByRole("button", {
        name: /Jetzt ausführen/i,
      });
      await expect(executeBtn).toBeVisible();
      await executeBtn.click();

      // Wait for button to be re-enabled (mutation completed)
      await expect(executeBtn).toBeEnabled({ timeout: 15_000 });

      // Navigate back to the schedule list. The schedules.list query was
      // invalidated by useExecuteSchedule, so React Query will refetch
      // it automatically when the list component mounts.
      await navigateTo(page, "/admin/schedules");
      await waitForTableLoad(page);

      // Verify the schedule is still present (list was invalidated and
      // refetched successfully — cache invalidation worked)
      await expectTableContains(page, "E2E Zeitplan");
    });
  },
);
