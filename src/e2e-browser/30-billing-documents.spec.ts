import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Belegkette GmbH";

/** Click a document row in the list table by matching text (e.g. "A-", "AB-") */
async function openDocument(page: Page, pattern: RegExp) {
  await navigateTo(page, "/orders/documents");
  await waitForTableLoad(page);
  const row = page.locator("table tbody tr").filter({ hasText: pattern }).filter({ hasText: COMPANY });
  await row.click();
  await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
    timeout: 10000,
  });
}

/** Click Abschließen and confirm the dialog */
async function finalizeDocument(page: Page) {
  await page.getByRole("button", { name: "Abschließen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText("Abgeschlossen")).toBeVisible({
    timeout: 10000,
  });
}

/** Click Fortführen, optionally select target type, and confirm */
async function forwardDocument(page: Page) {
  await page.getByRole("button", { name: "Fortführen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Fortführen" }).click();
  await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
    timeout: 10000,
  });
  await expect(page.getByText("Entwurf")).toBeVisible({ timeout: 10000 });
}

test.describe.serial("UC-ORD-01: Document Chain (Belegkette)", () => {
  // ── Pre-condition: Ensure address exists ──────────────────────────
  test("create address for billing tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);
    await fillInput(page, "company", COMPANY);
    await fillInput(page, "street", "Demostraße 42");
    await fillInput(page, "zip", "80331");
    await fillInput(page, "city", "München");
    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY);

    // Verify auto-generated customer number (K-xxx)
    const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
    await expect(row).toContainText(/K-\d+/);
  });

  // ── 1b. Add contact person ─────────────────────────────────────────
  test("add contact person to address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);
    const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await page.getByRole("tab", { name: "Kontakte" }).click();
    await page.getByRole("button", { name: "Kontakt hinzufügen" }).click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.locator("#firstName").fill("Maria");
    await dialog.locator("#lastName").fill("Schmidt");
    await dialog.locator("#contactEmail").fill("maria@belegkette.de");
    await dialog.getByRole("button", { name: /Anlegen|Speichern/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    // Verify contact appears
    await expect(page.getByText("Maria Schmidt")).toBeVisible();
  });

  // ── 1. Navigate to billing documents ──────────────────────────────
  test("navigate to billing documents page", async ({ page }) => {
    await navigateTo(page, "/orders/documents");
    await expect(
      page.getByRole("heading", { name: "Belege" })
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 2. Create an Offer (Angebot) ─────────────────────────────────
  test("create an offer", async ({ page }) => {
    await navigateTo(page, "/orders/documents/new");
    await expect(page.getByText("Neuer Beleg")).toBeVisible({
      timeout: 10000,
    });

    // Type OFFER is default, select customer
    await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
    await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
      timeout: 10000,
    });
    await expect(page.getByText("Entwurf")).toBeVisible();
  });

  // ── 3. Add positions to the offer ─────────────────────────────────
  test("add positions to the offer", async ({ page }) => {
    await openDocument(page, /A-/);

    // Switch to Positionen tab
    await page.getByRole("tab", { name: /Positionen/ }).click();

    // Add a position
    await page.getByRole("button", { name: "Position hinzufügen" }).click();
    await page.waitForTimeout(500);

    // Fill position fields inline
    const posRow = page.locator('[role="tabpanel"] table tbody tr').last();

    // Description: "Instandhaltung"
    const descInput = posRow.locator('input[placeholder="Beschreibung"]');
    await descInput.fill("Instandhaltung");
    await descInput.blur();

    // Menge: 10
    const qtyInput = posRow.locator('input[type="number"]').first();
    await qtyInput.fill("10");
    await qtyInput.blur();

    // Einzelpreis: 100
    const priceInput = posRow.locator('input[type="number"]').nth(1);
    await priceInput.fill("100");
    await priceInput.blur();

    // MwSt: 19% (verify or set)
    const vatInput = posRow.locator('input[type="number"]').nth(3);
    const vatValue = await vatInput.inputValue();
    if (vatValue !== "19") {
      await vatInput.fill("19");
      await vatInput.blur();
    }

    // Wait for totals to recalculate
    await page.waitForTimeout(1000);

    // Verify position count
    await expect(page.getByRole("tab", { name: /Positionen \(1\)/ })).toBeVisible();

    // Verify netto total (10 × 100 = 1.000,00)
    await expect(page.getByText(/1[.]000,00/)).toBeVisible({ timeout: 5_000 });

    // Verify brutto total (1.000 × 1.19 = 1.190,00)
    await expect(page.getByText(/1[.]190,00/)).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Finalize the offer ─────────────────────────────────────────
  test("finalize the offer", async ({ page }) => {
    await openDocument(page, /A-/);
    await finalizeDocument(page);
  });

  // ── 5. Verify immutability — no edit controls on finalized doc ────
  test("finalized document is immutable", async ({ page }) => {
    await openDocument(page, /A-/);

    // Abschließen button should NOT be visible
    await expect(
      page.getByRole("button", { name: "Abschließen" })
    ).not.toBeVisible();

    // Fortführen button SHOULD be visible
    await expect(
      page.getByRole("button", { name: "Fortführen" })
    ).toBeVisible();

    // Hinweis-Banner should indicate finalized state
    await expect(
      page.getByText(/festgeschrieben|kann nicht mehr bearbeitet/i).first()
    ).toBeVisible();

    // "Position hinzufügen" should NOT be visible on Positionen tab
    await page.getByRole("tab", { name: /Positionen/ }).click();
    await expect(
      page.getByRole("button", { name: "Position hinzufügen" })
    ).not.toBeVisible();
  });

  // ── 6. Forward offer → order confirmation (AB) ────────────────────
  test("forward offer to order confirmation", async ({ page }) => {
    await openDocument(page, /A-/);

    await page.getByRole("button", { name: "Fortführen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Only valid target for OFFER is Auftragsbestätigung
    await expect(dialog.getByText("Auftragsbestätigung")).toBeVisible();
    await dialog.getByRole("button", { name: "Fortführen" }).click();

    // Redirected to new AB document in Entwurf
    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
      timeout: 10000,
    });
    await expect(page.getByText("Entwurf")).toBeVisible({ timeout: 10000 });
  });

  // ── 7. Verify source offer is now "Fortgeführt" ───────────────────
  test("source offer status is Fortgeführt", async ({ page }) => {
    await openDocument(page, /A-/);
    await expect(page.getByText("Fortgeführt")).toBeVisible();
    // Cannot forward again
    await expect(
      page.getByRole("button", { name: "Fortführen" })
    ).not.toBeVisible();
  });

  // ── 8. Finalize AB with order creation ────────────────────────────
  test("finalize order confirmation creates linked order", async ({
    page,
  }) => {
    await openDocument(page, /AB-/);

    await page.getByRole("button", { name: "Abschließen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // ORDER_CONFIRMATION should show order creation section
    await expect(
      dialog.getByText("Auftrag für Zeiterfassung erstellen")
    ).toBeVisible();

    // Fill order fields
    await dialog.locator("#orderName").fill("Projekt " + COMPANY);
    await dialog
      .locator("#orderDescription")
      .fill("Beratung und Umsetzung");

    await dialog.getByRole("button", { name: "Abschließen" }).click();
    await expect(page.getByText("Abgeschlossen")).toBeVisible({
      timeout: 10000,
    });

    // Verify the linked order is shown in the overview tab
    await page.getByRole("tab", { name: /Übersicht/ }).click();
    await expect(
      page.getByText("Verknüpfter Auftrag")
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("Projekt " + COMPANY)
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 9. Forward AB → delivery note ─────────────────────────────────
  test("forward order confirmation to delivery note", async ({ page }) => {
    await openDocument(page, /AB-/);
    // AB can forward to Lieferschein or Leistungsschein
    await page.getByRole("button", { name: "Fortführen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Lieferschein")).toBeVisible();
    await dialog.getByRole("button", { name: "Fortführen" }).click();

    await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
      timeout: 10000,
    });
    await expect(page.getByText("Entwurf")).toBeVisible({ timeout: 10000 });
  });

  // ── 10. Finalize delivery note and forward to invoice ─────────────
  test("finalize delivery note and forward to invoice", async ({ page }) => {
    await openDocument(page, /LS-/);
    await finalizeDocument(page);
    await forwardDocument(page);
    // Now on the new RE document in Entwurf
  });

  // ── 11. Finalize invoice (end of chain) ───────────────────────────
  test("finalize invoice — end of chain", async ({ page }) => {
    await openDocument(page, /RE-/);
    await finalizeDocument(page);

    // Invoice cannot be forwarded — Fortführen should NOT be visible
    await expect(
      page.getByRole("button", { name: "Fortführen" })
    ).not.toBeVisible();
  });

  // ── 12. Verify full chain in document list ────────────────────────
  test("document list shows all 4 document types", async ({ page }) => {
    await navigateTo(page, "/orders/documents");
    await waitForTableLoad(page);

    // Each document type badge should appear in the list
    for (const typeName of ["Angebot", "Auftragsbestätigung", "Lieferschein", "Rechnung"]) {
      await expect(
        page.locator("table tbody tr").filter({ hasText: typeName })
      ).toBeVisible();
    }
  });

  // ── 13. Verify chain tab shows parent/child relationships ─────────
  test("chain tab shows document relationships", async ({ page }) => {
    await openDocument(page, /AB-/);

    // Switch to Kette tab
    await page.getByRole("tab", { name: "Kette" }).click();

    // AB should show parent (the offer A-) and child (LS-)
    const panel = page.locator('[role="tabpanel"]');
    await expect(panel.getByText(/A-\d+/)).toBeVisible({ timeout: 5000 });
    await expect(panel.getByText(/LS-\d+/)).toBeVisible({ timeout: 5000 });
  });

  // ── 14. Finalized invoice appears in Offene Posten ──────────────────
  test("finalized invoice appears in Offene Posten", async ({ page }) => {
    await navigateTo(page, "/orders/open-items");
    await waitForTableLoad(page);

    const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
    await expect(row).toBeVisible();

    // Status should be "Offen"
    await expect(row).toContainText("Offen");

    // Brutto amount 1.190,00 EUR
    await expect(row).toContainText(/1[.]190,00/);
  });
});
