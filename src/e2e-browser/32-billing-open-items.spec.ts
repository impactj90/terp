import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

/**
 * UC-ORD-03: Offene Posten / Zahlungen
 *
 * Follows TERP_HANDBUCH.md §13.11.1 step-by-step:
 *
 *   Szenario: Rechnung über 1.190,00 EUR brutto. Kunde zahlt Teilbetrag
 *   per Überweisung, dann Rest bar mit Skonto-Abzug.
 *
 *   Voraussetzung: Kundenadresse + Rechnung (1.190€, 30 Tage, 3%/10d, 2%/20d)
 *   Schritt 1: Offene Posten aufrufen — RE erscheint mit Status "Offen", 1.190€
 *   Schritt 2: Teilzahlung 500€ per Überweisung mit Notiz "Anzahlung"
 *   Schritt 3: Restzahlung bar mit Skonto — 669,30€ + 20,70€ Skonto
 *   Schritt 4: Letzte Barzahlung stornieren — Status zurück zu Teilzahlung
 */

// --- Constants ---
const COMPANY = "E2E Zahlungs GmbH";

// ==========================================================================

test.describe.serial(
  "UC-ORD-03: Praxisbeispiel Offene Posten / Zahlungen (§13.11.1)",
  () => {
    // -- Voraussetzung: Kundenadresse anlegen --
    test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => {
      await navigateTo(page, "/crm/addresses");
      await page.getByRole("button", { name: "Neue Adresse" }).click();
      await waitForSheet(page);
      await fillInput(page, "company", COMPANY);
      await fillInput(page, "city", "München");
      await submitAndWaitForClose(page);
      await waitForTableLoad(page);
      await expectTableContains(page, COMPANY);
    });

    // -- Voraussetzung: Rechnung erstellen und abschließen --
    // RE über 1.190,00 EUR (1.000 netto + 19% MwSt)
    // Zahlungsziel 30 Tage, Skonto 1: 3%/10 Tage, Skonto 2: 2%/20 Tage
    test("Voraussetzung: Rechnung erstellen und abschließen", async ({
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
      await fillInput(page, "discountPercent", "3");
      await fillInput(page, "discountDays", "10");
      await fillInput(page, "discountPercent2", "2");
      await fillInput(page, "discountDays2", "20");

      // 5. Submit — navigates to document detail
      await page.getByRole("button", { name: /Speichern/i }).click();
      await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // 6. Add position: switch to Positionen tab
      await page.getByRole("tab", { name: /Positionen/i }).click();

      // Click "Position hinzufügen" (adds a default Freitext row)
      await page.getByRole("button", { name: /Position hinzufügen/i }).click();

      // Wait for the row to appear, then edit inline
      const posRow = page.locator("table tbody tr").first();
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

      // Verify the document is now finalized (lock icon or status badge)
      await expect(
        page.getByText(/festgeschrieben|Abgeschlossen/i).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    // -- Schritt 1: Offene Posten aufrufen --
    test("Schritt 1: Offene Posten aufrufen", async ({ page }) => {
      // §13.11.1 Schritt 1: Aufträge > Offene Posten
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);

      // RE erscheint in der Liste
      const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
      await expect(row).toBeVisible();

      // Status "Offen"
      await expect(row).toContainText("Offen");

      // Spalte "Offen" zeigt 1.190,00 €
      await expect(row).toContainText(/1[.]190,00/);
    });

    // -- Schritt 2: Teilzahlung per Überweisung --
    test("Schritt 2: Teilzahlung 500€ per Überweisung", async ({ page }) => {
      // Navigate to detail page
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);
      const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
      await row.click();
      await page.waitForURL(/\/orders\/open-items\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // §13.11.1 Schritt 2.3: Klick auf "Zahlung erfassen"
      await page.getByRole("button", { name: /Zahlung erfassen/i }).click();

      // Dialog opens
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // §13.11.1 Schritt 2.5: Betrag "500" eintragen
      await dialog.locator("#payment-amount").clear();
      await dialog.locator("#payment-amount").fill("500");

      // §13.11.1 Schritt 2.6: Zahlungsart "Überweisung" (already default)

      // §13.11.1 Schritt 2.7: Notizen "Anzahlung"
      await dialog.locator("#payment-notes").fill("Anzahlung");

      // §13.11.1 Schritt 2.8: Klick auf "Zahlung erfassen"
      await dialog.getByRole("button", { name: /Zahlung erfassen/i }).click();

      // Wait for dialog to close
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // §13.11.1 Schritt 2.10: Status wechselt zu "Teilzahlung"
      await expect(page.getByText("Teilzahlung").first()).toBeVisible({
        timeout: 10_000,
      });

      // §13.11.1 Schritt 2.11: Bezahlt: 500,00 € | Offen: 690,00 €
      await expect(page.locator("main")).toContainText(/500,00/);
      await expect(page.locator("main")).toContainText(/690,00/);

      // Verify "Anzahlung" appears in payment history
      await expect(page.locator("main")).toContainText("Anzahlung");
    });

    // -- Schritt 3: Restzahlung bar mit Skonto --
    test("Schritt 3: Restzahlung bar mit Skonto", async ({ page }) => {
      // Navigate to detail page
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);
      const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
      await row.click();
      await page.waitForURL(/\/orders\/open-items\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // §13.11.1 Schritt 3.1: Klick auf "Zahlung erfassen"
      await page.getByRole("button", { name: /Zahlung erfassen/i }).click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // §13.11.1 Schritt 3.2: Betrag ist vorausgefüllt mit 690,00 EUR
      const amountInput = dialog.locator("#payment-amount");
      await expect(amountInput).toHaveValue("690.00");

      // §13.11.1 Schritt 3.3: Zahlungsart "Bar"
      await dialog.locator("#payment-type").click();
      await page.getByRole("option", { name: "Bar" }).click();

      // §13.11.1 Schritt 3.4: Skonto aktivieren (Checkbox)
      await dialog.locator("#payment-discount").click();

      // §13.11.1 Schritt 3.5: System zeigt Skonto-Info (3% Abzug 20,70€)
      await expect(dialog.getByText(/Skonto.*3%/)).toBeVisible();
      await expect(dialog).toContainText(/20,70/);

      // §13.11.1 Schritt 3.6: Betrag automatisch angepasst auf 669,30€
      await expect(amountInput).toHaveValue("669.30");

      // §13.11.1 Schritt 3.7: Klick auf "Zahlung erfassen"
      await dialog.getByRole("button", { name: /Zahlung erfassen/i }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // §13.11.1 Schritt 3.8: Zwei Einträge — Zahlung (669,30€) und Skonto (20,70€)
      await expect(page.locator("main")).toContainText(/669,30/, { timeout: 10_000 });
      await expect(page.locator("main")).toContainText(/20,70/);

      // §13.11.1 Schritt 3.9: Status wechselt zu "Bezahlt"
      await expect(page.getByText("Bezahlt").first()).toBeVisible({
        timeout: 10_000,
      });
    });

    // -- Schritt 4: Zahlung stornieren --
    test("Schritt 4: Letzte Barzahlung stornieren", async ({ page }) => {
      // Navigate to detail page
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);
      const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
      await row.click();
      await page.waitForURL(/\/orders\/open-items\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // §13.11.1 Schritt 4.1: Klick auf "Stornieren" bei der Barzahlung (669,30€)
      const paymentRow = page
        .locator("table tbody tr")
        .filter({ hasText: "669,30" });
      await paymentRow.getByRole("button", { name: /Stornieren/i }).click();

      // §13.11.1 Schritt 4.2: Bestätigungsdialog → "Bestätigen"
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /Bestätigen/i }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // §13.11.1 Schritt 4.3: Zahlung wird als "Storniert" markiert
      await expect(page.getByText("Storniert").first()).toBeVisible({
        timeout: 10_000,
      });

      // §13.11.1 Schritt 4.5: Status wechselt zurück zu "Teilzahlung"
      await expect(page.getByText("Teilzahlung").first()).toBeVisible({
        timeout: 10_000,
      });

      // §13.11.1 Schritt 4.6: Offen: 690,00 EUR
      await expect(page.locator("main")).toContainText(/690,00/);
    });

    // -- Ergebnis: Zusammenfassung prüfen --
    test("Ergebnis: Zahlungshistorie dokumentiert alle Vorgänge", async ({
      page,
    }) => {
      // Navigate back to list
      await navigateTo(page, "/orders/open-items");
      await waitForTableLoad(page);

      // RE appears with status "Teilzahlung"
      const row = page.locator("table tbody tr").filter({ hasText: COMPANY });
      await expect(row).toBeVisible();
      await expect(row.getByText("Teilzahlung")).toBeVisible();

      // Summary card is visible with open amount
      await expect(page.getByText("Gesamt offen").first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }
);
