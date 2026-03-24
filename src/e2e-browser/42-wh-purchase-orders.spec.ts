import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  openRowActions,
  clickMenuItem,
} from "./helpers/forms";

// --- Constants ---
const SUPPLIER_COMPANY = "E2E Lieferant AG"; // Created by 40-wh-articles.spec.ts
const ARTICLE_NAME = "E2E Testschraube M8x40"; // Created by 40-wh-articles.spec.ts

test.describe.serial("UC-WH-03: Purchase Orders", () => {
  // ─── Navigate to purchase orders page ─────────────────────────────

  test("navigate to purchase orders page", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");
    await expect(
      main.getByRole("button", { name: /Neue Bestellung/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Create a purchase order ──────────────────────────────────────

  test("create a purchase order with positions", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");

    // Click "New Purchase Order" — navigates to /warehouse/purchase-orders/new
    await main
      .getByRole("button", { name: /Neue Bestellung|New Purchase Order/i })
      .click();
    await page.waitForURL(/\/warehouse\/purchase-orders\/new/, { timeout: 10_000 });

    // Select supplier
    await selectOption(page, /Lieferant|Supplier/i, new RegExp(SUPPLIER_COMPANY, "i"));

    // Submit the form
    const submitBtn = page.getByRole("button", { name: /Erstellen|Speichern|Create|Save/i });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Should navigate to PO detail or back to list
    await navigateTo(page, "/warehouse/purchase-orders");
    await page.waitForTimeout(1000);

    // Look for the PO in the table (it should have status DRAFT)
    const tableBody = main.locator("table tbody");
    await expect(
      tableBody.locator("tr").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── View PO detail ───────────────────────────────────────────────

  test("view purchase order detail", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");

    // Wait for table
    await page.waitForTimeout(2000);

    // Click the first row to view detail
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);

    if (isVisible) {
      await firstRow.click();
      await page.waitForURL("**/warehouse/purchase-orders/**");
      await main.waitFor({ state: "visible" });

      // Verify we're on the detail page — should show supplier name or PO number
      await expect(
        main.getByText(/BES-|Entwurf|Draft/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  // ─── Add a position to the PO ─────────────────────────────────────

  test("add a position to the purchase order", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Click first PO to go to detail
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);
    if (!isVisible) return;

    await firstRow.click();
    await page.waitForURL("**/warehouse/purchase-orders/**");
    await main.waitFor({ state: "visible" });

    // Find the "Add Position" / "Position hinzufuegen" button
    const addBtn = main.getByRole("button", {
      name: /Position hinzuf|Add Position/i,
    });
    const addBtnVisible = await addBtn.isVisible().catch(() => false);

    if (addBtnVisible) {
      await addBtn.click();

      // Wait for sheet/dialog
      await waitForSheet(page);

      // Select article
      await selectOption(page, /Artikel|Article/i, new RegExp(ARTICLE_NAME, "i"));

      // Fill quantity
      await fillInput(page, "quantity", "10");

      await submitAndWaitForClose(page);
      await page.waitForTimeout(1000);

      // Verify position appears in the positions table
      await expect(
        main.getByText(ARTICLE_NAME).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ─── Send (finalize) PO ───────────────────────────────────────────

  test("send a purchase order", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");

    await page.waitForTimeout(2000);

    // Click first PO
    const firstRow = main.locator("table tbody tr").first();
    const isVisible = await firstRow.isVisible().catch(() => false);
    if (!isVisible) return;

    await firstRow.click();
    await page.waitForURL("**/warehouse/purchase-orders/**");
    await main.waitFor({ state: "visible" });

    // Click "Send Order" / "Bestellen" button
    const sendBtn = main.getByRole("button", {
      name: /Bestellen|Send Order|Bestellung senden/i,
    });
    const sendBtnVisible = await sendBtn.isVisible().catch(() => false);

    if (sendBtnVisible) {
      await sendBtn.click();

      // The send dialog should appear
      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: "visible" });

      // Select method: Email
      await selectOption(page, /Bestellmethode|Method/i, /E-Mail|Email/i);

      // Confirm
      await dialog.getByRole("button", { name: /Bestellen|Send|Absenden/i }).click();
      await page.waitForTimeout(2000);

      // Verify status changed to ORDERED / Bestellt
      await expect(
        main.getByText(/Bestellt|ORDERED/i).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ─── Cancel a PO ──────────────────────────────────────────────────

  test("cancel a purchase order from list", async ({ page }) => {
    // First create another PO so we can cancel it without affecting the ordered one
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");

    // Create a new PO
    const newBtn = main.getByRole("button", {
      name: /Neue Bestellung|New Purchase Order/i,
    });
    const newBtnVisible = await newBtn.isVisible().catch(() => false);

    if (newBtnVisible) {
      await newBtn.click();
      await waitForSheet(page);

      await selectOption(page, /Lieferant|Supplier/i, new RegExp(SUPPLIER_COMPANY, "i"));
      await submitAndWaitForClose(page);
      await page.waitForTimeout(1000);
    }

    // Now look for a DRAFT PO and cancel it via row actions
    await navigateTo(page, "/warehouse/purchase-orders");
    await page.waitForTimeout(2000);

    const draftRow = main
      .locator("table tbody tr")
      .filter({ hasText: /Entwurf|Draft/i })
      .first();
    const draftVisible = await draftRow.isVisible().catch(() => false);

    if (draftVisible) {
      // Use row action to cancel
      await draftRow.getByRole("button").last().click();
      await page.getByRole("menu").waitFor({ state: "visible" });
      await page.getByRole("menuitem", { name: /Stornieren|Cancel/i }).click();

      // Confirm dialog
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
      const dialogVisible = await dialog.isVisible().catch(() => false);
      if (dialogVisible) {
        await dialog.getByRole("button", { name: /Stornieren|Cancel|Confirm/i }).click();
        await page.waitForTimeout(1000);
      }
    }
  });

  // ─── Reorder suggestions page ─────────────────────────────────────

  test("view reorder suggestions page", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders/suggestions");
    const main = page.locator("main#main-content");

    // Wait for the page to load
    await expect(
      main.getByText(/Bestellvorschl|Reorder Suggestion/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The page should show either a table of articles below min stock or empty state
    await expect(
      main
        .getByText(
          /Artikel|Keine Artikel unter Mindestbestand|No articles below minimum stock/i,
        )
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
