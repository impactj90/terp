import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

/**
 * UC-ORD-05: Wiederkehrende Rechnungen -- Praxisbeispiel 13.13.1
 * "Wiederkehrende Rechnung erstellen und Rechnung generieren"
 *
 * Tests every single step from TERP_HANDBUCH.md section 13.13.1.
 */

const COMPANY = "E2E Wiederkehrende GmbH";
const TEMPLATE_NAME = "Wartungsvertrag Monatlich";

test.describe.serial(
  "UC-ORD-05: Praxisbeispiel 13.13.1 -- Wiederkehrende Rechnung erstellen und generieren",
  () => {
    // ── Voraussetzung: Kundenadresse anlegen ──────────────────────────
    test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => {
      await navigateTo(page, "/crm/addresses");
      await page.getByRole("button", { name: "Neue Adresse" }).click();
      await waitForSheet(page);
      await fillInput(page, "company", COMPANY);
      await fillInput(page, "city", "Stuttgart");
      await submitAndWaitForClose(page);
      await waitForTableLoad(page);
      await expectTableContains(page, COMPANY);
    });

    // ── Schritt 1: Vorlage anlegen (13.13.1 Schritt 1, Steps 1-12) ───
    test("Schritt 1: Vorlage anlegen", async ({ page }) => {
      // Step 1: 📍 Auftraege > Wiederkehrende Rechnungen
      await navigateTo(page, "/orders/recurring");
      await expect(
        page.getByRole("heading", { name: "Wiederkehrende Rechnungen" }),
      ).toBeVisible({ timeout: 10_000 });

      // Step 2: Klick auf "Neue Vorlage"
      await page.getByRole("link", { name: "Neue Vorlage" }).click();
      await page.waitForURL(/\/orders\/recurring\/new/, { timeout: 10_000 });

      // Step 3: Formularseite oeffnet sich
      await expect(
        page.getByRole("heading", {
          name: "Neue wiederkehrende Rechnung",
        }),
      ).toBeVisible({ timeout: 10_000 });

      // Step 4: Name: "Wartungsvertrag Monatlich"
      await page.locator("#rec-name").fill(TEMPLATE_NAME);

      // Step 5: Kundenadresse: company auswaehlen
      await page.locator("#rec-address").click();
      await page
        .getByRole("option")
        .filter({ hasText: COMPANY })
        .first()
        .click();

      // Step 6: Intervall: "Monatlich" — default, verify displayed
      await expect(page.locator("#rec-interval")).toContainText("Monatlich");

      // Step 7: Startdatum: 01.04.2026
      await page.locator("#rec-start").fill("2026-04-01");

      // Step 8: Automatisch generieren: Checkbox aktivieren
      await page.locator("#rec-auto").click();

      // Step 9: Zahlungsziel: 30 Tage
      await page.locator("#rec-payment").fill("30");

      // Step 10: Position ausfuellen
      // Default position: type=FREE, quantity=1, unit=Stk, vatRate=19
      const posRow = page.locator("table tbody tr").first();

      // 10a — Typ: Freitext (already default, verify)
      await expect(posRow.locator("td").first()).toContainText("Freitext");

      // 10b — Beschreibung: "Monatliche Wartungspauschale"
      await page.locator("#pos-desc-0").fill("Monatliche Wartungspauschale");

      // 10c — Menge: 1 (already default, verify)
      const qtyInput = posRow.locator("td").nth(2).locator("input");
      await expect(qtyInput).toHaveValue("1");

      // 10d — Einheit: "Stk" (already default, verify)
      const unitInput = posRow.locator("td").nth(3).locator("input");
      await expect(unitInput).toHaveValue("Stk");

      // 10e — Einzelpreis: 500,00
      const priceInput = posRow.locator("td").nth(4).locator("input");
      await priceInput.fill("500");

      // 10f — MwSt: 19% (already default, verify)
      const vatInput = posRow.locator("td").nth(6).locator("input");
      await expect(vatInput).toHaveValue("19");

      // Verify calculated total shows 500,00
      await expect(posRow.locator("td").nth(7)).toContainText("500,00");

      // Step 11: Klick auf "Speichern"
      await page.getByRole("button", { name: "Speichern" }).click();

      // Redirects to detail page
      await page.waitForURL(/\/orders\/recurring\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Step 12: ✅ Vorlage in Liste pruefen
      await navigateTo(page, "/orders/recurring");
      await waitForTableLoad(page);

      const row = page
        .locator("table tbody tr")
        .filter({ hasText: TEMPLATE_NAME })
        .first();
      await expect(row).toBeVisible();

      // Verify columns: Kunde, Intervall, Naechste Faelligkeit, Aktiv
      await expect(row).toContainText(COMPANY);
      await expect(row).toContainText("Monatlich");
      await expect(row).toContainText(/0?1\.0?4\.2026/);
      await expect(row.getByText("Aktiv")).toBeVisible();
    });

    // ── Schritt 2: Rechnung manuell generieren (13.13.1 Schritt 2, Steps 1-8) ──
    test("Schritt 2: Rechnung manuell generieren", async ({ page }) => {
      await navigateTo(page, "/orders/recurring");
      await waitForTableLoad(page);

      // Step 1: In der Liste Vorlage anklicken
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: TEMPLATE_NAME })
        .first();
      await row.click();

      // Step 2: Detailseite oeffnet sich
      await page.waitForURL(/\/orders\/recurring\/[0-9a-f-]+/, {
        timeout: 10_000,
      });
      await expect(
        page.getByRole("heading", { name: TEMPLATE_NAME }),
      ).toBeVisible({ timeout: 10_000 });

      // Verify detail info before generation
      await expect(page.getByText("Nächste Fälligkeit")).toBeVisible();
      await expect(page.getByText(/0?1\.0?4\.2026/).first()).toBeVisible();

      // Step 3: Klick auf "Rechnung generieren"
      await page
        .getByRole("button", { name: "Rechnung generieren" })
        .click();

      // Step 4: Bestaetigungsdialog mit Vorschau (Netto, MwSt, Brutto)
      const sheet = page.locator(
        '[data-slot="sheet-content"][data-state="open"]',
      );
      await sheet.waitFor({ state: "visible" });

      await expect(sheet).toContainText("Rechnung generieren");
      await expect(sheet).toContainText("Netto");
      await expect(sheet).toContainText("500,00");
      await expect(sheet).toContainText("MwSt");
      await expect(sheet).toContainText("95,00");
      await expect(sheet).toContainText("Brutto");
      await expect(sheet).toContainText("595,00");

      // Step 5: Klick auf "Generieren"
      const footer = sheet.locator('[data-slot="sheet-footer"]');
      await footer.getByRole("button", { name: "Generieren" }).click();

      // Step 6: ✅ Erfolgsmeldung "Rechnung RE-X wurde erstellt"
      await expect(
        page.getByText(/Rechnung RE-\d+ wurde erstellt/),
      ).toBeVisible({ timeout: 15_000 });

      // Dialog redirects to invoice detail page
      await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Navigate back to recurring detail to check updated dates
      await navigateTo(page, "/orders/recurring");
      await waitForTableLoad(page);

      const updatedRow = page
        .locator("table tbody tr")
        .filter({ hasText: TEMPLATE_NAME })
        .first();
      await updatedRow.click();
      await page.waitForURL(/\/orders\/recurring\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Step 7: ✅ Naechste Faelligkeit ist jetzt 01.05.2026
      await expect(page.getByText(/0?1\.0?5\.2026/)).toBeVisible({
        timeout: 10_000,
      });

      // Step 8: ✅ Letzte Generierung zeigt das heutige Datum
      const today = new Intl.DateTimeFormat("de-DE").format(new Date());
      await expect(page.getByText(today)).toBeVisible({ timeout: 5_000 });
    });

    // ── Schritt 3: Erzeugte Rechnung pruefen (13.13.1 Schritt 3, Steps 1-5) ──
    test("Schritt 3: Erzeugte Rechnung in Belegen pruefen", async ({
      page,
    }) => {
      // Step 1: 📍 Auftraege > Belege
      await navigateTo(page, "/orders/documents");
      await waitForTableLoad(page);

      // Step 2: Rechnung RE-X mit Kunde sichtbar
      const invoiceRow = page
        .locator("table tbody tr")
        .filter({ hasText: /RE-/ })
        .filter({ hasText: COMPANY })
        .first();
      await expect(invoiceRow).toBeVisible({ timeout: 10_000 });

      // Step 3: Belegtyp: Rechnung, Kunde: company
      await expect(invoiceRow).toContainText("Rechnung");

      // Open invoice detail
      await invoiceRow.click();
      await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Step 4: Positions are embedded in A4 editor
      const posArea = page.locator('[data-testid="position-table-area"]');
      await expect(posArea).toBeVisible({ timeout: 5_000 });
      await expect(posArea.locator('input[value="Monatliche Wartungspauschale"]')).toBeVisible({ timeout: 5_000 });

      // Verify position details: 500,00 EUR
      await expect(posArea).toContainText("500,00");

      // Step 5: ✅ Summen: Netto 500,00, MwSt 95,00, Brutto 595,00
      // Totals are shown directly in the A4 editor
      const totalsArea = page.locator('[data-testid="totals-area"]');
      await expect(totalsArea.getByText(/500,00/)).toBeVisible({ timeout: 5_000 });
      await expect(totalsArea.getByText(/595,00/)).toBeVisible({ timeout: 5_000 });
    });

    // ── Vorlage deaktivieren (13.13 section "Vorlage deaktivieren", Steps 1-4) ──
    test("Schritt 4: Vorlage deaktivieren und reaktivieren", async ({
      page,
    }) => {
      await navigateTo(page, "/orders/recurring");
      await waitForTableLoad(page);

      // Open template detail
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: TEMPLATE_NAME })
        .first();
      await row.click();
      await page.waitForURL(/\/orders\/recurring\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Step 1: Klick auf "Deaktivieren"
      await page.getByRole("button", { name: "Deaktivieren" }).click();

      // Step 2: Vorlage wird inaktiv
      await expect(page.getByText("Inaktiv")).toBeVisible({ timeout: 5_000 });

      // Step 3: Manuelle Generierung ist gesperrt (button hidden when inactive)
      await expect(
        page.getByRole("button", { name: "Rechnung generieren" }),
      ).not.toBeVisible();

      // Step 4: "Aktivieren" kann die Vorlage wieder einschalten
      await expect(
        page.getByRole("button", { name: "Aktivieren" }),
      ).toBeVisible();

      // Verify reactivation
      await page.getByRole("button", { name: "Aktivieren" }).click();
      await expect(
        page.getByText("Aktiv", { exact: true }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("button", { name: "Rechnung generieren" }),
      ).toBeVisible();
    });
  },
);
