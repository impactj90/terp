import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

/**
 * UC-ORD-02: Kundendienst — Praxisbeispiel "Heizungsreparatur bis Rechnung"
 *
 * Follows TERP_HANDBUCH.md §13.10.1 step-by-step:
 *   Schritt 1: Serviceauftrag anlegen
 *   Schritt 2: Mitarbeiter zuweisen und Auftrag erstellen
 *   Schritt 3: Serviceauftrag abschließen
 *   Schritt 4: Rechnung erstellen (3 Positionen)
 *   Schritt 5: Rechnung abschließen
 *   + CRM-Integration: Kundendienst-Tab in Adressdetailseite
 */

// --- Constants ---
const COMPANY = "E2E Kundendienst GmbH";
const EMPLOYEE = "Thomas Mueller"; // Seed EMP004
const SC_TITLE = "Heizungsreparatur";
const SC_DESCRIPTION =
  "Heizung im EG fällt regelmäßig aus. Vor-Ort-Termin erforderlich.";
const CLOSING_REASON =
  "Thermostat getauscht, Heizung funktioniert wieder.";

// --- Helpers ---

/** Navigate to service case list, click a row matching text, wait for detail URL */
async function openServiceCaseDetail(page: Page, match: RegExp) {
  await navigateTo(page, "/orders/service-cases");
  await waitForTableLoad(page);
  const row = page.locator("table tbody tr").filter({ hasText: match }).filter({ hasText: SC_TITLE });
  await row.click();
  await page.waitForURL(/\/orders\/service-cases\/[0-9a-f-]+/, {
    timeout: 10_000,
  });
}

// ==========================================================================

test.describe.serial(
  "UC-ORD-02: Praxisbeispiel Heizungsreparatur bis Rechnung",
  () => {
    // ── Voraussetzung: Kundenadresse anlegen ────────────────────────────
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

    // ── Schritt 1: Serviceauftrag anlegen ───────────────────────────────
    // Handbuch §13.10.1 Schritt 1
    test("Schritt 1: Serviceauftrag anlegen", async ({ page }) => {
      // 1. Aufträge > Kundendienst
      await navigateTo(page, "/orders/service-cases");

      // 2. Klick auf "Neuer Serviceauftrag"
      await page
        .getByRole("button", { name: "Neuer Serviceauftrag" })
        .click();

      // 3. Seitenformular öffnet sich
      await waitForSheet(page);

      // 4. Titel: "Heizungsreparatur" eintragen
      await page.locator("#sc-title").fill(SC_TITLE);

      // 5. Kundenadresse auswählen
      await page.locator("#sc-address").click();
      await page
        .getByRole("option", { name: new RegExp(COMPANY) })
        .click();

      // 6. Beschreibung eintragen
      await page.locator("#sc-desc").fill(SC_DESCRIPTION);

      // 7. Auf Kosten hingewiesen: Checkbox aktivieren
      await page.locator("#sc-cost").click();

      // 8. "Speichern"
      await submitAndWaitForClose(page);
      await waitForTableLoad(page);

      // 9. ✅ Serviceauftrag mit KD-Nummer als "Offen" in der Liste
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: /KD-/ })
        .filter({ hasText: SC_TITLE });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row.getByText("Offen")).toBeVisible();
    });

    // ── Schritt 2: Mitarbeiter zuweisen und Auftrag erstellen ───────────
    // Handbuch §13.10.1 Schritt 2
    test("Schritt 2: Mitarbeiter zuweisen und Auftrag erstellen", async ({
      page,
    }) => {
      // 1. In der Kundendienstliste: Klick auf KD-Nummer
      await openServiceCaseDetail(page, /KD-/);

      // 2. Detailseite — verify title + status
      await expect(page.getByText(SC_TITLE)).toBeVisible();
      await expect(page.getByText("Offen")).toBeVisible();

      // 3. Klick auf "Bearbeiten"
      await page
        .getByRole("button", { name: "Bearbeiten" })
        .click();
      await waitForSheet(page);

      // 4. Zuständiger Mitarbeiter auswählen
      await page.locator("#sc-assigned").click();
      await page
        .getByRole("option", { name: new RegExp(EMPLOYEE) })
        .click();

      // 5. "Speichern"
      await submitAndWaitForClose(page);

      // 6. ✅ Status wechselt zu "In Bearbeitung"
      await expect(page.getByText("In Bearbeitung")).toBeVisible({
        timeout: 10_000,
      });

      // Verify assigned employee shown in detail
      await expect(page.getByText(EMPLOYEE)).toBeVisible();

      // 7. Klick auf "Auftrag erstellen"
      await page
        .getByRole("button", { name: "Auftrag erstellen" })
        .click();

      // 8. Bestätigen im Dialog
      const orderDialog = page.getByRole("dialog");
      await expect(orderDialog).toBeVisible();
      await orderDialog
        .getByRole("button", { name: "Auftrag erstellen" })
        .click();

      // 9. ✅ Verknüpfter Auftrag wird angezeigt
      await expect(page.getByText("Verknüpfter Auftrag:")).toBeVisible({
        timeout: 10_000,
      });

      // 10. ✅ "Auftrag erstellen" Button verschwindet (nur 1 Auftrag pro Case)
      await expect(
        page.getByRole("button", { name: "Auftrag erstellen" })
      ).not.toBeVisible();
    });

    // ── Schritt 3: Serviceauftrag abschließen ───────────────────────────
    // Handbuch §13.10.1 Schritt 3
    test("Schritt 3: Serviceauftrag abschließen", async ({ page }) => {
      await openServiceCaseDetail(page, /KD-/);

      // 1. Klick auf "Abschließen"
      await page
        .getByRole("button", { name: "Abschließen" })
        .click();

      // 2. Dialog: Abschlussgrund eintragen
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("#closingReason").fill(CLOSING_REASON);

      // 3. Klick auf "Abschließen"
      await dialog
        .getByRole("button", { name: "Abschließen" })
        .click();

      // 4. ✅ Status wechselt zu "Abgeschlossen"
      await expect(page.getByText("Abgeschlossen")).toBeVisible({
        timeout: 10_000,
      });

      // 5. ✅ Hinweis-Banner
      await expect(
        page.getByText(
          "Dieser Serviceauftrag ist abgeschlossen und kann nicht mehr bearbeitet werden."
        )
      ).toBeVisible();

      // 6. ✅ "Rechnung erstellen" erscheint, "Bearbeiten" verschwindet
      await expect(
        page.getByRole("button", { name: "Rechnung erstellen" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Bearbeiten" })
      ).not.toBeVisible();

      // Verify closing reason in detail
      await expect(page.getByText(CLOSING_REASON)).toBeVisible();
    });

    // ── Schritt 4: Rechnung erstellen ───────────────────────────────────
    // Handbuch §13.10.1 Schritt 4 — 3 Positionen
    test("Schritt 4: Rechnung erstellen mit 3 Positionen", async ({
      page,
    }) => {
      await openServiceCaseDetail(page, /KD-/);

      // 1. Klick auf "Rechnung erstellen"
      await page
        .getByRole("button", { name: "Rechnung erstellen" })
        .click();

      // 2. Dialog "Rechnung erstellen" öffnet sich
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // --- Position 1: Arbeitszeit Techniker ---
      const pos1 = dialog.locator(".border.rounded-lg").nth(0);
      await pos1
        .locator('input[placeholder="z.B. Arbeitszeit Techniker"]')
        .fill("Arbeitszeit Techniker");
      await pos1.locator('input[placeholder="0"]').fill("2");
      await pos1.locator('input[placeholder="Std"]').fill("Std");
      await pos1.locator('input[placeholder="0,00"]').fill("85");
      // MwSt% defaults to 19 — leave as is

      // 3. "Position hinzufügen" for Position 2
      await dialog
        .getByRole("button", { name: "Position hinzufügen" })
        .click();

      // --- Position 2: Thermostat (Ersatzteil) ---
      const pos2 = dialog.locator(".border.rounded-lg").nth(1);
      await pos2
        .locator('input[placeholder="z.B. Arbeitszeit Techniker"]')
        .fill("Thermostat (Ersatzteil)");
      await pos2.locator('input[placeholder="0"]').fill("1");
      await pos2.locator('input[placeholder="Std"]').fill("Stk");
      await pos2.locator('input[placeholder="0,00"]').fill("45");

      // "Position hinzufügen" for Position 3
      await dialog
        .getByRole("button", { name: "Position hinzufügen" })
        .click();

      // --- Position 3: Anfahrtspauschale (Pauschalkosten) ---
      const pos3 = dialog.locator(".border.rounded-lg").nth(2);
      await pos3
        .locator('input[placeholder="z.B. Arbeitszeit Techniker"]')
        .fill("Anfahrtspauschale");
      await pos3
        .locator('input[placeholder="Optional"]')
        .fill("35");

      // 4. Klick auf "Rechnung erstellen"
      await dialog
        .getByRole("button", { name: "Rechnung erstellen" })
        .click();

      // 5. ✅ RE-Nummer als Beleg erstellt
      // 6. ✅ Status wechselt zu "Abgerechnet"
      await expect(page.getByText("Abgerechnet")).toBeVisible({
        timeout: 10_000,
      });

      // 7. ✅ Verknüpfte Rechnung (RE-Nummer) wird angezeigt
      await expect(page.getByText("Verknüpfte Rechnung:")).toBeVisible({
        timeout: 10_000,
      });
      // Store invoice link text (RE-xxx) for next step
      const invoiceLink = page.locator("text=Verknüpfte Rechnung:").locator("..").locator("a, button").first();
      await expect(invoiceLink).toBeVisible();
    });

    // ── Schritt 5: Rechnung abschließen ─────────────────────────────────
    // Handbuch §13.10.1 Schritt 5
    test("Schritt 5: Rechnung abschließen", async ({ page }) => {
      // 1. Navigate via service case detail → invoice link
      await openServiceCaseDetail(page, /KD-/);

      // Click the invoice link (RE-xxx)
      const invoiceLink = page
        .getByText("Verknüpfte Rechnung:")
        .locator("..")
        .locator("a, button")
        .first();
      await invoiceLink.click();

      // Wait for document detail page
      await page.waitForURL(/\/orders\/documents\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // 2. Positionen prüfen — all 3 should be visible
      await expect(page.getByText("Arbeitszeit Techniker")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByText("Thermostat (Ersatzteil)")
      ).toBeVisible();
      await expect(page.getByText("Anfahrtspauschale")).toBeVisible();

      // 3. Klick auf "Abschließen" → Bestätigen
      await page
        .getByRole("button", { name: "Abschließen" })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Abschließen" })
        .click();

      // 4. ✅ Rechnung ist festgeschrieben (Status "Abgeschlossen")
      await expect(page.getByText("Abgeschlossen")).toBeVisible({
        timeout: 10_000,
      });
    });

    // ── CRM-Integration: Kundendienst-Tab ───────────────────────────────
    test("CRM-Integration: Kundendienst-Tab in Adressdetailseite", async ({
      page,
    }) => {
      // Navigate to address detail
      await navigateTo(page, "/crm/addresses");
      await waitForTableLoad(page);
      const row = page
        .locator("table tbody tr")
        .filter({ hasText: COMPANY });
      await row.click();
      await page.waitForURL(/\/crm\/addresses\/[0-9a-f-]+/, {
        timeout: 10_000,
      });

      // Click "Kundendienst" tab
      await page.getByRole("tab", { name: "Kundendienst" }).click();

      // ✅ Serviceauftrag mit KD-Nummer und Titel sichtbar
      await expect(page.getByText(/KD-/)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(SC_TITLE)).toBeVisible();
    });
  }
);
