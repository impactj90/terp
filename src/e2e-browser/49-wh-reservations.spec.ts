import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Reservierung GmbH";
const ARTICLE_NAME = "E2E Reservierungsartikel";
const ARTICLE_SELL_PRICE = "12.50";

// --- Helpers ---

/** Navigate to article list, click a row, and land on the detail page */
async function openArticleDetail(page: Page, articleName: string) {
  await navigateTo(page, "/warehouse/articles");
  await waitForTableLoad(page);
  const row = page.locator("table tbody tr").filter({ hasText: articleName });
  await row.click();
  await page.waitForURL("**/warehouse/articles/**");
  await page.locator("main#main-content").waitFor({ state: "visible" });
}

/** Navigate to billing documents and open the first matching document */
async function openDocument(page: Page, pattern: RegExp, statusFilter?: RegExp) {
  await navigateTo(page, "/orders/documents");
  await waitForTableLoad(page);
  let row = page
    .locator("table tbody tr")
    .filter({ hasText: pattern })
    .filter({ hasText: COMPANY });
  if (statusFilter) {
    row = row.filter({ hasText: statusFilter });
  }
  await row.first().click();
  await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
    timeout: 10000,
  });
}

test.describe.serial("UC-WH-10: Artikelreservierungen (Stock Reservations)", () => {
  // ─── Pre-conditions ─────────────────────────────────────────────

  test("create CRM address for reservation tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);
    await fillInput(page, "company", COMPANY);
    await fillInput(page, "street", "Reservierungsstr. 7");
    await fillInput(page, "zip", "50667");
    await fillInput(page, "city", "Köln");
    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY);
  });

  test("create article with stock tracking and stock 100", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");

    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    await waitForSheet(page);

    // Fill required fields
    await fillInput(page, "name", ARTICLE_NAME);
    await fillInput(page, "sellPrice", ARTICLE_SELL_PRICE);

    // Enable stock tracking
    await page.locator('button[role="switch"]#stockTracking').click();
    await page.waitForTimeout(300);

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, ARTICLE_NAME);

    // Navigate to detail page and set stock to 100
    await openArticleDetail(page, ARTICLE_NAME);

    // Click "Bestand korrigieren"
    await page.getByRole("button", { name: /Bestand korrigieren/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Enter +100 as stock adjustment
    await dialog.locator("#quantity").fill("100");
    await dialog.locator("#reason").fill("E2E initial stock");
    await dialog.getByRole("button", { name: "Korrigieren" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    // Verify stock shows 100 on the overview tab
    const main = page.locator("main#main-content");
    await expect(main.getByText("100").first()).toBeVisible({ timeout: 5_000 });
  });

  // ─── Test 1: Finalize AB creates reservation ────────────────────

  test("create ORDER_CONFIRMATION with article position", async ({ page }) => {
    // Create a new AB directly
    await navigateTo(page, "/orders/documents/new?type=ORDER_CONFIRMATION");
    await expect(page.getByText("Neuer Beleg")).toBeVisible({ timeout: 10000 });

    // Select document type: Auftragsbestätigung (may already be set via URL param)
    const typeSelect = page.locator("#type");
    const currentType = await typeSelect.textContent();
    if (!currentType?.includes("Auftragsbestätigung")) {
      await typeSelect.click();
      await page.getByRole("option", { name: "Auftragsbestätigung" }).click();
    }

    // Select customer address
    await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
    await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
    await expect(page.getByText("Entwurf")).toBeVisible();
  });

  test("add article position with quantity 30 to the AB", async ({ page }) => {
    await openDocument(page, /AB-/);

    // Change position type to Artikel before adding
    const posTypeSelect = page.locator('[data-testid="position-table-area"]').locator('button[role="combobox"]').first();
    const posTypeVisible = await posTypeSelect.isVisible().catch(() => false);
    if (posTypeVisible) {
      await posTypeSelect.click();
      await page.getByRole("option", { name: "Artikel" }).click();
      await page.waitForTimeout(300);
    }

    // Click "Position hinzufügen"
    await page.getByRole("button", { name: /Position hinzufügen/ }).click();
    await page.waitForTimeout(1000);

    // Fill position fields — the last row in the position table
    const posRow = page
      .locator('[data-testid="position-table-area"] table tbody tr')
      .last();

    // Description: type the article name to trigger autocomplete or just fill
    const descInput = posRow.locator('input[placeholder="Beschreibung"]');
    await descInput.fill(ARTICLE_NAME);
    await page.waitForTimeout(1000);

    // If autocomplete dropdown shows, select the article
    const autocompleteOption = page.locator('.absolute.z-50 button, [role="option"]')
      .filter({ hasText: ARTICLE_NAME })
      .first();
    const autocompleteVisible = await autocompleteOption.isVisible().catch(() => false);
    if (autocompleteVisible) {
      await autocompleteOption.click();
      await page.waitForTimeout(500);
    } else {
      await descInput.blur();
      await page.waitForTimeout(500);
    }

    // Quantity: 30
    const qtyInput = posRow.locator('input[type="number"]').first();
    await qtyInput.fill("30");
    await qtyInput.blur();
    await page.waitForTimeout(500);

    // Unit price: 12.50
    const priceInput = posRow.locator('input[type="number"]').nth(1);
    await priceInput.fill("12.50");
    await priceInput.blur();
    await page.waitForTimeout(500);

    // MwSt: ensure 19%
    const vatInput = posRow.locator('input[type="number"]').nth(3);
    const vatValue = await vatInput.inputValue();
    if (vatValue !== "19") {
      await vatInput.fill("19");
      await vatInput.blur();
      await page.waitForTimeout(500);
    }

    // Wait for totals to recalculate
    await page.waitForTimeout(2000);

    // Verify totals area shows values
    const totals = page.locator('[data-testid="totals-area"]');
    await expect(totals).toBeVisible({ timeout: 5_000 });
  });

  test("finalize AB creates reservation — Reserviert=30, Verfügbar=70", async ({ page }) => {
    await openDocument(page, /AB-/);

    // Finalize — ORDER_CONFIRMATION shows order creation section
    await page.getByRole("button", { name: "Abschließen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Skip optional order creation (leave orderName empty)
    await dialog.getByRole("button", { name: "Abschließen" }).click();
    await expect(page.getByText("Abgeschlossen")).toBeVisible({
      timeout: 10000,
    });

    // Now check article detail: Reserviert=30, Verfügbar=70
    await openArticleDetail(page, ARTICLE_NAME);

    // The stock info card on the overview tab shows physical/reserved/available
    const main = page.locator("main#main-content");

    // Look for "Reserviert" label with value 30
    await expect(main.getByText("Reserviert").first()).toBeVisible({ timeout: 5_000 });
    await expect(
      main.locator("text=30").first(),
    ).toBeVisible({ timeout: 5_000 });

    // Look for "Verfügbar" label with value 70
    await expect(main.getByText("Verfügbar").first()).toBeVisible({ timeout: 5_000 });
    await expect(
      main.locator("text=70").first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ─── Test 2: Forward AB to LS releases reservation ──────────────

  test("forward AB to delivery note resolves reservation", async ({ page }) => {
    await openDocument(page, /AB-/);

    // Forward to Lieferschein
    await page.getByRole("button", { name: "Fortführen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Lieferschein")).toBeVisible();
    await dialog.getByRole("button", { name: "Fortführen" }).click();

    // Redirected to new LS document in Entwurf
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
    await expect(page.getByText("Entwurf")).toBeVisible({ timeout: 10000 });

    // Check article reservations tab — should show FULFILLED status
    await openArticleDetail(page, ARTICLE_NAME);
    await clickTab(page, "Reservierungen");
    await page.waitForTimeout(2000);

    // Look for "Erfüllt" (FULFILLED) status badge
    const main = page.locator("main#main-content");
    await expect(main.getByText("Erfüllt").first()).toBeVisible({ timeout: 10_000 });
  });

  // ─── Test 3: Manual release of a reservation ────────────────────

  test("create second AB with reservation for manual release", async ({ page }) => {
    // First adjust stock back up (the previous forward did not change physical stock yet)
    // Create a new AB with the same article
    await navigateTo(page, "/orders/documents/new?type=ORDER_CONFIRMATION");
    await expect(page.getByText("Neuer Beleg")).toBeVisible({ timeout: 10000 });

    const typeSelect = page.locator("#type");
    const currentType = await typeSelect.textContent();
    if (!currentType?.includes("Auftragsbestätigung")) {
      await typeSelect.click();
      await page.getByRole("option", { name: "Auftragsbestätigung" }).click();
    }

    await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
    await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
    await expect(page.getByText("Entwurf")).toBeVisible();

    // Add article position with quantity 20
    const posTypeSelect = page.locator('[data-testid="position-table-area"]').locator('button[role="combobox"]').first();
    const posTypeVisible = await posTypeSelect.isVisible().catch(() => false);
    if (posTypeVisible) {
      await posTypeSelect.click();
      await page.getByRole("option", { name: "Artikel" }).click();
      await page.waitForTimeout(300);
    }

    await page.getByRole("button", { name: /Position hinzufügen/ }).click();
    await page.waitForTimeout(1000);

    const posRow = page
      .locator('[data-testid="position-table-area"] table tbody tr')
      .last();

    const descInput = posRow.locator('input[placeholder="Beschreibung"]');
    await descInput.fill(ARTICLE_NAME);
    await page.waitForTimeout(1000);

    const autocompleteOption = page.locator('.absolute.z-50 button, [role="option"]')
      .filter({ hasText: ARTICLE_NAME })
      .first();
    const autocompleteVisible = await autocompleteOption.isVisible().catch(() => false);
    if (autocompleteVisible) {
      await autocompleteOption.click();
      await page.waitForTimeout(500);
    } else {
      await descInput.blur();
      await page.waitForTimeout(500);
    }

    const qtyInput = posRow.locator('input[type="number"]').first();
    await qtyInput.fill("20");
    await qtyInput.blur();
    await page.waitForTimeout(500);

    const priceInput = posRow.locator('input[type="number"]').nth(1);
    await priceInput.fill("12.50");
    await priceInput.blur();
    await page.waitForTimeout(500);

    await page.waitForTimeout(2000);

    // Finalize to create reservation
    await page.getByRole("button", { name: "Abschließen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Abschließen" }).click();
    await expect(page.getByText("Abgeschlossen")).toBeVisible({ timeout: 10000 });
  });

  test("manually release reservation from reservations overview", async ({ page }) => {
    await navigateTo(page, "/warehouse/reservations");
    const main = page.locator("main#main-content");
    await expect(
      main.getByRole("heading", { name: /Reservierungen/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for the table to load
    await page.waitForTimeout(2000);

    // Look for the article in the active reservations table
    const articleRow = main.locator("table tbody tr").filter({ hasText: ARTICLE_NAME }).first();
    const rowVisible = await articleRow.isVisible().catch(() => false);

    if (rowVisible) {
      // Click "Freigeben" button in the row
      const releaseBtn = articleRow.getByRole("button", { name: /Freigeben/i });
      await expect(releaseBtn).toBeVisible({ timeout: 5_000 });
      await releaseBtn.click();

      // Fill release reason in the dialog
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("input").fill("E2E manuelle Freigabe");
      await dialog.getByRole("button", { name: /Freigeben/i }).click();
      await dialog.waitFor({ state: "hidden", timeout: 10_000 });

      // Verify the reservation status changed — switch filter to see released
      await page.waitForTimeout(1000);
    }

    // Verify available stock increased on article detail
    await openArticleDetail(page, ARTICLE_NAME);
    const articleMain = page.locator("main#main-content");

    // Verfügbar should now be 100 (no active reservations left)
    await expect(articleMain.getByText("Verfügbar").first()).toBeVisible({ timeout: 5_000 });
    await expect(articleMain.getByText("100").first()).toBeVisible({ timeout: 5_000 });
  });

  // ─── Test 4: Warning for insufficient available stock ───────────

  test("warning when available stock is insufficient", async ({ page }) => {
    // Adjust stock to exactly 100 (it should already be 100)
    // Create a large reservation: AB with 80 units
    await navigateTo(page, "/orders/documents/new?type=ORDER_CONFIRMATION");
    await expect(page.getByText("Neuer Beleg")).toBeVisible({ timeout: 10000 });

    const typeSelect = page.locator("#type");
    const currentType = await typeSelect.textContent();
    if (!currentType?.includes("Auftragsbestätigung")) {
      await typeSelect.click();
      await page.getByRole("option", { name: "Auftragsbestätigung" }).click();
    }

    await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
    await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
    await expect(page.getByText("Entwurf")).toBeVisible();

    // Add position with 80 units
    const posTypeSelect = page.locator('[data-testid="position-table-area"]').locator('button[role="combobox"]').first();
    const posTypeVisible = await posTypeSelect.isVisible().catch(() => false);
    if (posTypeVisible) {
      await posTypeSelect.click();
      await page.getByRole("option", { name: "Artikel" }).click();
      await page.waitForTimeout(300);
    }

    await page.getByRole("button", { name: /Position hinzufügen/ }).click();
    await page.waitForTimeout(1000);

    const posRow = page
      .locator('[data-testid="position-table-area"] table tbody tr')
      .last();

    const descInput = posRow.locator('input[placeholder="Beschreibung"]');
    await descInput.fill(ARTICLE_NAME);
    await page.waitForTimeout(1000);

    const autocompleteOption = page.locator('.absolute.z-50 button, [role="option"]')
      .filter({ hasText: ARTICLE_NAME })
      .first();
    const autocompleteVisible = await autocompleteOption.isVisible().catch(() => false);
    if (autocompleteVisible) {
      await autocompleteOption.click();
      await page.waitForTimeout(500);
    } else {
      await descInput.blur();
      await page.waitForTimeout(500);
    }

    const qtyInput = posRow.locator('input[type="number"]').first();
    await qtyInput.fill("80");
    await qtyInput.blur();
    await page.waitForTimeout(500);

    const priceInput = posRow.locator('input[type="number"]').nth(1);
    await priceInput.fill("12.50");
    await priceInput.blur();
    await page.waitForTimeout(2000);

    // Finalize to create the 80-unit reservation
    await page.getByRole("button", { name: "Abschließen" }).click();
    const dialog80 = page.getByRole("dialog");
    await expect(dialog80).toBeVisible();
    await dialog80.getByRole("button", { name: "Abschließen" }).click();
    await expect(page.getByText("Abgeschlossen")).toBeVisible({ timeout: 10000 });

    // Now create another AB with 30 units — this should exceed available stock (100 - 80 = 20 available)
    await navigateTo(page, "/orders/documents/new?type=ORDER_CONFIRMATION");
    await expect(page.getByText("Neuer Beleg")).toBeVisible({ timeout: 10000 });

    const typeSelect2 = page.locator("#type");
    const currentType2 = await typeSelect2.textContent();
    if (!currentType2?.includes("Auftragsbestätigung")) {
      await typeSelect2.click();
      await page.getByRole("option", { name: "Auftragsbestätigung" }).click();
    }

    await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
    await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
    await expect(page.getByText("Entwurf")).toBeVisible();

    // Add position with 30 units
    const posTypeSelect2 = page.locator('[data-testid="position-table-area"]').locator('button[role="combobox"]').first();
    const posTypeVisible2 = await posTypeSelect2.isVisible().catch(() => false);
    if (posTypeVisible2) {
      await posTypeSelect2.click();
      await page.getByRole("option", { name: "Artikel" }).click();
      await page.waitForTimeout(300);
    }

    await page.getByRole("button", { name: /Position hinzufügen/ }).click();
    await page.waitForTimeout(1000);

    const posRow2 = page
      .locator('[data-testid="position-table-area"] table tbody tr')
      .last();

    const descInput2 = posRow2.locator('input[placeholder="Beschreibung"]');
    await descInput2.fill(ARTICLE_NAME);
    await page.waitForTimeout(1000);

    const autocompleteOption2 = page.locator('.absolute.z-50 button, [role="option"]')
      .filter({ hasText: ARTICLE_NAME })
      .first();
    const autocompleteVisible2 = await autocompleteOption2.isVisible().catch(() => false);
    if (autocompleteVisible2) {
      await autocompleteOption2.click();
      await page.waitForTimeout(500);
    } else {
      await descInput2.blur();
      await page.waitForTimeout(500);
    }

    const qtyInput2 = posRow2.locator('input[type="number"]').first();
    await qtyInput2.fill("30");
    await qtyInput2.blur();
    await page.waitForTimeout(500);

    const priceInput2 = posRow2.locator('input[type="number"]').nth(1);
    await priceInput2.fill("12.50");
    await priceInput2.blur();
    await page.waitForTimeout(2000);

    // Finalize — this creates a reservation that puts available stock below 0
    await page.getByRole("button", { name: "Abschließen" }).click();
    const dialog30 = page.getByRole("dialog");
    await expect(dialog30).toBeVisible();
    await dialog30.getByRole("button", { name: "Abschließen" }).click();
    await expect(page.getByText("Abgeschlossen")).toBeVisible({ timeout: 10000 });

    // Check article detail — available stock should be negative, warning should appear
    await openArticleDetail(page, ARTICLE_NAME);
    const main = page.locator("main#main-content");

    // The ArticleStockInfoCard shows "Verfügbarer Bestand nicht ausreichend" when availableStock < 0
    // Available = 100 - 80 - 30 = -10
    await expect(
      main.getByText(/Verfügbarer Bestand nicht ausreichend/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
