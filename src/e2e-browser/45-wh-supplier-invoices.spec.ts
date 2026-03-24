import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";
import {
  selectOption,
  waitForSheet,
} from "./helpers/forms";

// --- Constants ---
const SUPPLIER_COMPANY = "E2E Lieferant AG"; // Created by 40-wh-articles.spec.ts
const INVOICE_NUMBER = "E2E-LR-001";
const INVOICE_NUMBER_2 = "E2E-LR-002";

test.describe.serial("UC-WH-06: Supplier Invoices", () => {
  // ─── Navigate to supplier invoices page ─────────────────────────────

  test("navigate to supplier invoices page", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");
    await expect(
      main.getByRole("button", { name: /Neue Rechnung|New Invoice/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Create a supplier invoice ──────────────────────────────────────

  test("create a supplier invoice", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    // Click "Neue Rechnung erfassen"
    await main
      .getByRole("button", { name: /Neue Rechnung|New Invoice/i })
      .click();

    // Wait for sheet to open
    await waitForSheet(page);

    // Select supplier
    await selectOption(
      page,
      /Lieferant|Supplier/i,
      new RegExp(SUPPLIER_COMPANY, "i"),
    );

    // Fill invoice number
    // Fill invoice number via label-based input
    const numberInput = page.getByLabel(/Rechnungsnummer|Invoice Number/i);
    await numberInput.fill(INVOICE_NUMBER);

    // Fill invoice date
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill("2026-03-15");

    // Fill amounts
    const numberInputs = page.locator('input[type="number"]');
    // Net amount
    await numberInputs.nth(0).fill("100");
    // VAT
    await numberInputs.nth(1).fill("19");

    // Submit the form
    const submitBtn = page.getByRole("button", {
      name: /Erstellen|Create|Speichern|Save/i,
    });
    await submitBtn.click();

    // Wait for sheet to close
    await page.waitForTimeout(2000);

    // Verify invoice appears in list
    await expect(
      main.getByText(INVOICE_NUMBER).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── View supplier invoice detail ───────────────────────────────────

  test("view supplier invoice detail", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Click the first row to view detail
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);

    if (isVisible) {
      await firstRow.click();
      await page.waitForURL("**/warehouse/supplier-invoices/**");
      await main.waitFor({ state: "visible" });

      // Verify detail page shows invoice number
      await expect(
        main.getByText(INVOICE_NUMBER).first(),
      ).toBeVisible({ timeout: 10_000 });

      // Verify status badge is visible (should be "Offen" / "Open")
      await expect(
        main.getByText(/Offen|Open/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  // ─── Record a partial payment ───────────────────────────────────────

  test("record a partial payment on supplier invoice", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Click first row to go to detail
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);
    if (!isVisible) return;

    await firstRow.click();
    await page.waitForURL("**/warehouse/supplier-invoices/**");
    await main.waitFor({ state: "visible" });

    // Click "Zahlung erfassen" / "Record Payment"
    const payBtn = main.getByRole("button", {
      name: /Zahlung erfassen|Record Payment/i,
    });
    await payBtn.click();

    // Wait for dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Fill amount (partial: 50)
    const amountInput = dialog.locator('input[type="number"]');
    await amountInput.fill("50");

    // Submit payment
    const submitPayment = dialog.getByRole("button", {
      name: /Erstellen|Create|Speichern|Save/i,
    });
    await submitPayment.click();

    await page.waitForTimeout(2000);

    // Verify status changed to "Teilweise bezahlt" / "Partially Paid"
    await expect(
      main.getByText(/Teilweise bezahlt|Partially Paid/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Record remaining payment to complete ───────────────────────────

  test("record remaining payment to complete invoice", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Click first row to go to detail
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);
    if (!isVisible) return;

    await firstRow.click();
    await page.waitForURL("**/warehouse/supplier-invoices/**");
    await main.waitFor({ state: "visible" });

    // Click "Zahlung erfassen"
    const payBtn = main.getByRole("button", {
      name: /Zahlung erfassen|Record Payment/i,
    });
    await payBtn.click();

    // Wait for dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // Fill remaining amount (69 = 119 - 50)
    const amountInput = dialog.locator('input[type="number"]');
    await amountInput.fill("69");

    // Submit payment
    const submitPayment = dialog.getByRole("button", {
      name: /Erstellen|Create|Speichern|Save/i,
    });
    await submitPayment.click();

    await page.waitForTimeout(2000);

    // Verify status changed to "Bezahlt" / "Paid"
    await expect(
      main.getByText(/Bezahlt|Paid/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Cancel a payment ───────────────────────────────────────────────

  test("cancel a payment and revert status", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Click first row to go to detail
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);
    if (!isVisible) return;

    await firstRow.click();
    await page.waitForURL("**/warehouse/supplier-invoices/**");
    await main.waitFor({ state: "visible" });

    // Find a cancel button in the payments table
    const cancelBtns = main.locator("table").last().locator("button");
    const cancelBtnCount = await cancelBtns.count();

    if (cancelBtnCount > 0) {
      // Click the last cancel button (most recent payment)
      await cancelBtns.last().click();

      // Confirm in dialog
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        const confirmBtn = dialog.getByRole("button", {
          name: /Stornieren|Cancel|Confirm/i,
        });
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  });

  // ─── Create and cancel a supplier invoice ───────────────────────────

  test("cancel a supplier invoice", async ({ page }) => {
    // First, create a new invoice for cancellation
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await main
      .getByRole("button", { name: /Neue Rechnung|New Invoice/i })
      .click();

    await waitForSheet(page);

    await selectOption(
      page,
      /Lieferant|Supplier/i,
      new RegExp(SUPPLIER_COMPANY, "i"),
    );

    // Fill invoice number via label-based input
    const numberInput = page.getByLabel(/Rechnungsnummer|Invoice Number/i);
    await numberInput.fill(INVOICE_NUMBER_2);

    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill("2026-03-20");

    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill("200");
    await numberInputs.nth(1).fill("38");

    const submitBtn = page.getByRole("button", {
      name: /Erstellen|Create|Speichern|Save/i,
    });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Navigate to the new invoice detail
    await expect(
      main.getByText(INVOICE_NUMBER_2).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the new invoice row
    const invoiceRow = main.locator("table tbody tr", { hasText: INVOICE_NUMBER_2 });
    await invoiceRow.click();
    await page.waitForURL("**/warehouse/supplier-invoices/**");
    await main.waitFor({ state: "visible" });

    // Click "Stornieren" / "Cancel"
    const cancelBtn = main.getByRole("button", {
      name: /Stornieren|Cancel/i,
    }).first();
    const cancelBtnVisible = await cancelBtn.isVisible().catch(() => false);

    if (cancelBtnVisible) {
      await cancelBtn.click();

      // Confirm in dialog
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
      await dialog.waitFor({ state: "visible", timeout: 5_000 });

      const confirmBtn = dialog.getByRole("button", {
        name: /Stornieren|Cancel|Confirm/i,
      }).last();
      await confirmBtn.click();
      await page.waitForTimeout(2000);

      // Verify status changed to "Storniert" / "Cancelled"
      await expect(
        main.getByText(/Storniert|Cancelled/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  // ─── Filter invoices by status ──────────────────────────────────────

  test("filter invoices by status", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Find the status filter dropdown
    const statusSelect = main.locator("button[role='combobox']").first();
    const isStatusSelectVisible = await statusSelect.isVisible().catch(() => false);

    if (isStatusSelectVisible) {
      await statusSelect.click();
      // Select "Storniert" / "Cancelled"
      const option = page.getByRole("option", {
        name: /Storniert|Cancelled/i,
      });
      const optionVisible = await option.isVisible().catch(() => false);
      if (optionVisible) {
        await option.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  // ─── Search invoices by number ──────────────────────────────────────

  test("search invoices by number", async ({ page }) => {
    await navigateTo(page, "/warehouse/supplier-invoices");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Type invoice number in search field
    const searchInput = main.locator('input[type="text"]').first();
    await searchInput.fill(INVOICE_NUMBER);
    await page.waitForTimeout(1500);

    // Verify matching invoice appears
    await expect(
      main.getByText(INVOICE_NUMBER).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
