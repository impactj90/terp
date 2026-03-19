import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

/**
 * UC-ORD-04: Preislisten — Praxisbeispiel 13.12.1
 * "Preisliste erstellen und Kunden zuweisen"
 *
 * Follows TERP_HANDBUCH.md section 13.12.1 step-by-step.
 */

const COMPANY = "E2E Preislisten GmbH";
const PRICE_LIST_NAME = "Standardpreisliste";
const PRICE_LIST_DESC = "Preisliste für Standardkunden";

test.describe.serial(
  "UC-ORD-04: Praxisbeispiel 13.12.1 — Preisliste erstellen und Kunden zuweisen",
  () => {
    // ── Voraussetzung: Kundenadresse anlegen ──────────────────────────
    test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => {
      await navigateTo(page, "/crm/addresses");
      await page.getByRole("button", { name: "Neue Adresse" }).click();
      await waitForSheet(page);
      await fillInput(page, "company", COMPANY);
      await fillInput(page, "city", "Berlin");
      await submitAndWaitForClose(page);
      await waitForTableLoad(page);
      await expectTableContains(page, COMPANY);
    });

    // ── Schritt 1: Preisliste anlegen ─────────────────────────────────
    // Handbook 13.12.1 Schritt 1:
    // 1. 📍 Aufträge > Preislisten
    // 2. Klick auf "Neue Preisliste"
    // 3. Seitenformular öffnet sich
    // 4. Name: "Standardpreisliste"
    // 5. Beschreibung: "Preisliste für Standardkunden"
    // 6. Standardpreisliste: Checkbox aktivieren
    // 7. Klick auf "Speichern"
    // 8. Preisliste erscheint in der Liste mit ausgefülltem Stern-Symbol
    test("Schritt 1: Preisliste anlegen", async ({ page }) => {
      // 1. Navigate to price lists
      await navigateTo(page, "/orders/price-lists");
      await expect(
        page.getByRole("heading", { name: "Preislisten" })
      ).toBeVisible({ timeout: 10000 });

      // 2. Click "Neue Preisliste"
      await page.getByRole("button", { name: "Neue Preisliste" }).click();

      // 3. Sheet opens
      await waitForSheet(page);

      // 4. Fill name
      await page.locator("#pl-name").fill(PRICE_LIST_NAME);

      // 5. Fill description
      await page.locator("#pl-description").fill(PRICE_LIST_DESC);

      // 6. Check default checkbox
      await page.locator("#pl-is-default").click();

      // 7. Save
      await submitAndWaitForClose(page);
      await waitForTableLoad(page);

      // 8. Verify price list appears in table with filled star icon (= Standard)
      await expectTableContains(page, PRICE_LIST_NAME);
      // Star icon for default should be filled (yellow)
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: PRICE_LIST_NAME });
      await expect(
        row.locator("svg.fill-yellow-400")
      ).toBeVisible();
    });

    // ── Schritt 2: Preiseinträge hinzufügen ───────────────────────────
    // Handbook 13.12.1 Schritt 2:
    // 1. Klick auf "Standardpreisliste" in der Liste
    // 2. Detailseite öffnet sich
    // 3. Klick auf "Neuer Eintrag"
    // 4. Dialog: Schlüssel "beratung_std", Beschreibung "Beratung pro Stunde",
    //    Einzelpreis 120, Einheit "Std"
    // 5. Speichern
    // 6. Eintrag erscheint: "Beratung pro Stunde | 120,00 EUR | Std"
    // 7. Erneut "Neuer Eintrag": Schlüssel "fahrtkosten",
    //    Beschreibung "Anfahrtspauschale", Einzelpreis 35
    // 8. Speichern
    // 9. Zweiter Eintrag erscheint
    test("Schritt 2: Preiseinträge hinzufügen", async ({ page }) => {
      // 1. Navigate to price lists and click on the one we created
      await navigateTo(page, "/orders/price-lists");
      await waitForTableLoad(page);
      // Use the row with 0 entries (just created) in case previous runs left data
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: PRICE_LIST_NAME })
        .first();
      await row.click();

      // 2. Detail page opens
      await page.waitForURL(/\/orders\/price-lists\/[0-9a-f-]+/, {
        timeout: 10000,
      });
      await expect(page.getByText(PRICE_LIST_NAME)).toBeVisible();

      // --- Entry 1: Beratung pro Stunde ---
      // 3. Click "Neuer Eintrag"
      await page.getByRole("button", { name: "Neuer Eintrag" }).click();

      // 4. Dialog opens — fill fields
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("#entry-item-key").fill("beratung_std");
      await dialog.locator("#entry-description").fill("Beratung pro Stunde");
      await dialog.locator("#entry-unit-price").fill("120");
      await dialog.locator("#entry-unit").fill("Std");

      // 5. Save
      await dialog.getByRole("button", { name: "Speichern" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      // 6. Verify first entry in the table
      await expect(page.getByText("Beratung pro Stunde")).toBeVisible();
      await expect(page.getByText("120,00")).toBeVisible();
      await expect(
        page.locator("table tbody tr").filter({ hasText: "Std" })
      ).toBeVisible();

      // --- Entry 2: Anfahrtspauschale ---
      // 7. Click "Neuer Eintrag" again
      await page.getByRole("button", { name: "Neuer Eintrag" }).click();

      const dialog2 = page.getByRole("dialog");
      await expect(dialog2).toBeVisible();
      await dialog2.locator("#entry-item-key").fill("fahrtkosten");
      await dialog2
        .locator("#entry-description")
        .fill("Anfahrtspauschale");
      await dialog2.locator("#entry-unit-price").fill("35");

      // 8. Save
      await dialog2.getByRole("button", { name: "Speichern" }).click();
      await expect(dialog2).not.toBeVisible({ timeout: 5000 });

      // 9. Verify second entry appears
      await expect(page.getByText("Anfahrtspauschale")).toBeVisible();
      await expect(page.getByText("35,00")).toBeVisible();
    });

    // ── Schritt 3: Preisliste dem Kunden zuweisen ─────────────────────
    // Handbook 13.12.1 Schritt 3:
    // 1. 📍 CRM > Adressen
    // 2. Klick auf den Kunden
    // 3. Detailseite öffnet sich
    // 4. Klick auf "Bearbeiten"
    // 5. Feld "Preisliste": Dropdown öffnen → "Standardpreisliste" auswählen
    // 6. Klick auf "Speichern"
    // 7. "Preisliste: Standardpreisliste" wird auf der Detailseite angezeigt
    test("Schritt 3: Preisliste dem Kunden zuweisen", async ({ page }) => {
      // 1. Navigate to CRM > Adressen
      await navigateTo(page, "/crm/addresses");
      await waitForTableLoad(page);

      // 2. Click on the customer
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: COMPANY });
      await row.click();

      // 3. Detail page opens
      await page.waitForURL(/\/crm\/addresses\/[0-9a-f-]+/, {
        timeout: 10000,
      });
      await expect(
        page.getByRole("heading", { name: COMPANY })
      ).toBeVisible();

      // 4. Click "Bearbeiten"
      await page.getByRole("button", { name: /Bearbeiten/ }).click();
      await waitForSheet(page);

      // 5. Open "Preisliste" dropdown and select "Standardpreisliste"
      await page.locator("#priceListId").click();
      await page
        .getByRole("option", { name: PRICE_LIST_NAME })
        .click();

      // 6. Save
      await submitAndWaitForClose(page);

      // 7. Verify price list is shown on detail page
      await expect(page.getByText(PRICE_LIST_NAME)).toBeVisible({
        timeout: 5000,
      });
    });

    // ── Schritt 4: Preis wird im Beleg vorausgefüllt ──────────────────
    // Handbook 13.12.1 Schritt 4:
    // 1. 📍 Aufträge > Belege
    // 2. Klick auf "Neuer Beleg"
    // 3. Belegtyp: "Angebot"
    // 4. Kundenadresse: Kunden mit Preisliste auswählen
    // 5. Speichern → Detailseite
    // 6. Tab "Positionen" → Positionstyp "Freitext" → "Position hinzufügen"
    // 7. Beschreibung = "beratung_std" eintragen → Einzelpreis 120,00 EUR vorausgefüllt
    // 8. Preis kann manuell überschrieben werden
    test("Schritt 4: Preis wird im Beleg vorausgefüllt", async ({ page }) => {
      // 1-2. Navigate to new document form
      await navigateTo(page, "/orders/documents/new");
      await expect(page.getByText("Neuer Beleg")).toBeVisible({
        timeout: 10000,
      });

      // 3. Type is OFFER by default

      // 4. Select customer with assigned price list
      await page.getByRole("combobox", { name: /Kundenadresse/ }).click();
      await page.getByRole("option", { name: new RegExp(COMPANY) }).click();

      // 5. Save → redirected to document detail
      await page.getByRole("button", { name: "Speichern" }).click();
      await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
        timeout: 10000,
      });
      await expect(page.getByText("Entwurf")).toBeVisible();

      // 6. Positions are embedded in A4 editor — no tab switch needed
      await page
        .getByRole("button", { name: "Position hinzufügen" })
        .click();
      await page.waitForTimeout(500);

      // 7. Type in description to trigger the autocomplete dropdown, then select the entry
      const lastRow = page
        .locator('[data-testid="position-table-area"] table tbody tr')
        .last();
      const descriptionInput = lastRow.locator('input[placeholder="Beschreibung"]');
      await descriptionInput.fill("beratung");

      // Select the matching entry from the autocomplete dropdown
      await page
        .locator('button', { hasText: 'beratung_std' })
        .first()
        .click();

      // Wait for the position to be updated with the price
      await page.waitForTimeout(1000);

      // 8. Verify unitPrice was auto-filled with 120 from the price list
      // number inputs in row: [0]=Menge, [1]=Einzelpreis, [2]=Pauschal, [3]=MwSt%
      const unitPriceInput = lastRow.locator('input[type="number"]').nth(1);
      await expect(unitPriceInput).toHaveValue("120", { timeout: 5000 });

      // 9. Verify price can be manually overridden (Handbook 4.8)
      await unitPriceInput.fill("95.50");
      await unitPriceInput.blur();
      await page.waitForTimeout(1000);
      await expect(unitPriceInput).toHaveValue("95.5", { timeout: 5000 });
    });
  }
);
