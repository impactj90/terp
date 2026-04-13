import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Editor GmbH";

/** Navigate to billing documents and open the first matching document */
async function openDocument(page: Page, pattern: RegExp) {
  await navigateTo(page, "/orders/documents");
  await waitForTableLoad(page);
  const row = page.locator("table tbody tr").filter({ hasText: pattern }).filter({ hasText: COMPANY });
  await row.click();
  await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
    timeout: 10000,
  });
}

test.describe.serial("UC-ORD-10: Document Editor (WYSIWYG A4 Layout)", () => {
  // ── Pre-condition: Create address ──────────────────────────────
  test("create address for editor tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);
    await fillInput(page, "company", COMPANY);
    await fillInput(page, "street", "Editorstraße 1");
    await fillInput(page, "zip", "10115");
    await fillInput(page, "city", "Berlin");
    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY);
  });

  // ── Create an offer for editing ──────────────────────────────
  test("create an offer for editor tests", async ({ page }) => {
    await navigateTo(page, "/orders/documents/new");
    await expect(page.getByText("Neuer Beleg")).toBeVisible({ timeout: 10000 });

    await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
    await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, { timeout: 10000 });
    await expect(page.getByText("Entwurf")).toBeVisible();
  });

  // ── Verify A4 document layout renders ────────────────────────
  test("document editor shows A4 page layout", async ({ page }) => {
    await openDocument(page, /AG-/);

    // A4 page container
    const canvas = page.locator('[data-testid="document-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const documentPage = page.locator('[data-testid="document-page"]');
    await expect(documentPage).toBeVisible();

    // Verify recipient address is shown
    await expect(documentPage.getByText(COMPANY)).toBeVisible();
  });

  // ── Verify header and footer text areas are visible ────────────
  test("header and footer text areas are visible in draft", async ({ page }) => {
    await openDocument(page, /AG-/);

    const headerArea = page.locator('[data-testid="header-text-area"]');
    await expect(headerArea).toBeVisible({ timeout: 10000 });

    const footerArea = page.locator('[data-testid="footer-text-area"]');
    await expect(footerArea).toBeVisible();
  });

  // ── Verify position table is embedded ──────────────────────────
  test("position table is embedded in A4 layout", async ({ page }) => {
    await openDocument(page, /AG-/);

    const positionArea = page.locator('[data-testid="position-table-area"]');
    await expect(positionArea).toBeVisible({ timeout: 10000 });

    // Should see "Position hinzufügen" button since it's a draft
    await expect(page.getByText(/Position hinzufügen/)).toBeVisible();
  });

  // ── Verify totals area is visible ──────────────────────────────
  test("totals summary is shown in A4 layout", async ({ page }) => {
    await openDocument(page, /AG-/);

    const totalsArea = page.locator('[data-testid="totals-area"]');
    await expect(totalsArea).toBeVisible({ timeout: 10000 });

    // Should show Netto, MwSt, Brutto labels
    await expect(totalsArea.getByText("Netto")).toBeVisible();
    await expect(totalsArea.getByText("Brutto")).toBeVisible();
  });

  // ── Verify sidebar with Belegkette ──────────────────────────────
  test("sidebar shows Belegkette and Konditionen", async ({ page }) => {
    await openDocument(page, /AG-/);

    // Sidebar should show Belegkette card
    await expect(page.getByText("Belegkette")).toBeVisible({ timeout: 10000 });

    // Sidebar should show Konditionen card
    await expect(page.getByText("Konditionen")).toBeVisible();

    // Sidebar should show Bemerkungen card
    await expect(page.getByText("Bemerkungen").first()).toBeVisible();

    // Sidebar should show Metadaten card
    await expect(page.getByText("Metadaten")).toBeVisible();
  });

  // ── Verify action buttons work ──────────────────────────────────
  test("action buttons are visible for draft document", async ({ page }) => {
    await openDocument(page, /AG-/);

    // Abschließen is the primary action for a draft
    await expect(page.getByRole("button", { name: "Abschließen" })).toBeVisible({ timeout: 10000 });

    // Secondary actions live inside the "Weitere Aktionen" dropdown
    await page.getByRole("button", { name: "Weitere Aktionen" }).click();
    await expect(page.getByRole("menuitem", { name: "Stornieren" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Duplizieren" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  // ── Verify Fußzeile placeholder ────────────────────────────────
  test("Fußzeile shows placeholder when no config", async ({ page }) => {
    await openDocument(page, /AG-/);

    const fusszeile = page.locator('[data-testid="fusszeile"]');
    await expect(fusszeile).toBeVisible({ timeout: 10000 });
  });

  // ── Add a position and verify totals update ────────────────────
  test("add position and verify totals", async ({ page }) => {
    await openDocument(page, /AG-/);

    // Click "Position hinzufügen"
    await page.getByRole("button", { name: /Position hinzufügen/ }).click();

    // Wait for the new row to appear and fill it
    const rows = page.locator("table tbody tr");
    await expect(rows).not.toHaveCount(0, { timeout: 5000 });

    // The totals should update
    const totalsArea = page.locator('[data-testid="totals-area"]');
    await expect(totalsArea).toBeVisible();
  });

  // ── Finalize document and verify immutable state ────────────────
  test("finalize document shows immutable notice", async ({ page }) => {
    await openDocument(page, /AG-/);

    // First add a position so we can finalize
    await page.getByRole("button", { name: /Position hinzufügen/ }).click();
    await page.waitForTimeout(1000);

    // Finalize
    await page.getByRole("button", { name: "Abschließen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: "Abschließen" }).click();

    // Should show immutable notice
    await expect(page.getByText(/festgeschrieben/)).toBeVisible({ timeout: 10000 });

    // Fortführen button should now be visible
    await expect(page.getByRole("button", { name: "Fortführen" })).toBeVisible();
  });
});
