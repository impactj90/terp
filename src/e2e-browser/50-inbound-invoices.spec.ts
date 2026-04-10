import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";
import * as path from "path";

const ZUGFERD_FIXTURE = path.resolve(
  __dirname,
  "../lib/services/__tests__/fixtures/zugferd/EN16931_Einfach.pdf"
);

test.describe.serial("UC-INV-01: Eingangsrechnungen", () => {
  let createdInvoiceUrl: string;

  // ---------------------------------------------------------------
  // 1. Navigate to list page
  // ---------------------------------------------------------------
  test("navigates to inbound invoices list via sidebar", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");
    // Should see the upload button
    await expect(
      main.getByRole("button", { name: /Hochladen|Upload/i })
    ).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 2. Upload a ZUGFeRD PDF
  // ---------------------------------------------------------------
  test("uploads a ZUGFeRD PDF and navigates to detail", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");

    // Click upload button
    await main.getByRole("button", { name: /Hochladen|Upload/i }).click();

    // Wait for dialog
    await expect(page.locator("[role='dialog']")).toBeVisible();

    // Upload the ZUGFeRD fixture via file chooser
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles(ZUGFERD_FIXTURE);

    // Wait for redirect to detail page
    await page.waitForURL("**/invoices/inbound/**", { timeout: 15_000 });
    createdInvoiceUrl = page.url();

    // Verify we're on the detail page with pre-filled ZUGFeRD data
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5_000 });
  });

  // ---------------------------------------------------------------
  // 3. Verify ZUGFeRD fields are pre-filled
  // ---------------------------------------------------------------
  test("shows pre-filled ZUGFeRD data on detail page", async ({ page }) => {
    test.skip(!createdInvoiceUrl, "No invoice created in previous test");
    await page.goto(createdInvoiceUrl);
    await page.waitForLoadState("networkidle");

    // Invoice number from EN16931_Einfach.pdf
    // Look for "471102" somewhere on the page (the ZUGFeRD invoice number)
    await expect(page.getByText("471102")).toBeVisible({ timeout: 10_000 });

    // Seller name should appear
    await expect(page.getByText("Lieferant GmbH")).toBeVisible();

    // Status badge should show Entwurf/Draft
    await expect(
      page.getByText(/Entwurf|Draft/i).first()
    ).toBeVisible();

    // ZUGFeRD profile badge
    await expect(page.getByText("EN16931")).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 4. Edit header fields
  // ---------------------------------------------------------------
  test("edits invoice header fields in DRAFT status", async ({ page }) => {
    test.skip(!createdInvoiceUrl, "No invoice created");
    await page.goto(createdInvoiceUrl);
    await page.waitForLoadState("networkidle");

    // Find and update the notes textarea
    const notesTextarea = page.locator("textarea").first();
    await notesTextarea.fill("E2E Test Notiz");

    // Click save
    await page.getByRole("button", { name: /Speichern|Save/i }).first().click();

    // Wait for success toast
    await expect(
      page.locator("[data-sonner-toast]").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ---------------------------------------------------------------
  // 5. Verify line items are displayed
  // ---------------------------------------------------------------
  test("shows line items from ZUGFeRD data", async ({ page }) => {
    test.skip(!createdInvoiceUrl, "No invoice created");
    await page.goto(createdInvoiceUrl);
    await page.waitForLoadState("networkidle");

    // The EN16931_Einfach.pdf has 2 line items: "Trennblätter A4" and "Joghurt Banane"
    await expect(page.getByText("Trennblätter A4")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Joghurt Banane")).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 6. List page shows the uploaded invoice
  // ---------------------------------------------------------------
  test("list page shows the uploaded invoice", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");

    // Should see the invoice number from ZUGFeRD
    await expect(main.getByText("471102")).toBeVisible({ timeout: 10_000 });

    // Should see Lieferant GmbH
    await expect(main.getByText("Lieferant GmbH")).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 7. Status filter works
  // ---------------------------------------------------------------
  test("status filter shows only matching invoices", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");

    // Select "Freigegeben" filter — should show no E2E invoices (ours is DRAFT)
    await main.locator("button[role='combobox']").first().click();
    await page.getByRole("option", { name: /Freigegeben|Approved/i }).click();
    await page.waitForTimeout(1000);

    // Our invoice (471102) should not be visible
    await expect(main.getByText("471102")).not.toBeVisible();

    // Switch back to "Alle Status"
    await main.locator("button[role='combobox']").first().click();
    await page.getByRole("option", { name: /Alle Status|All/i }).click();
    await page.waitForTimeout(1000);

    // Our invoice should be back
    await expect(main.getByText("471102")).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 8. Cancel an invoice
  // ---------------------------------------------------------------
  test("cancels an invoice via list action menu", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound");
    const main = page.locator("main#main-content");

    // Find our invoice row and click the action menu
    const row = main.locator("table tbody tr").filter({ hasText: "471102" });
    await row.locator("button").last().click();

    // Click "Stornieren"
    await page.getByRole("menuitem", { name: /Stornieren|Cancel/i }).click();

    // Confirm in dialog
    await expect(page.locator("[role='alertdialog'], [role='dialog']")).toBeVisible();
    await page.locator("[role='alertdialog'] button, [role='dialog'] button").filter({ hasText: /Stornieren|Bestätigen|Confirm/i }).click();

    // Wait for toast
    await expect(
      page.locator("[data-sonner-toast]").first()
    ).toBeVisible({ timeout: 5_000 });

    // Status should now show Storniert
    await page.waitForTimeout(1000);
    await expect(main.getByText(/Storniert|Cancelled/i).first()).toBeVisible();
  });
});
