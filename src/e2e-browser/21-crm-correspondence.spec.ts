import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Korr GmbH";
const CONTACT_FIRST = "E2E Anna";
const CONTACT_LAST = "E2E Schmidt";
const SUBJECT_PHONE = "E2E Telefongespräch Liefertermin";
const SUBJECT_EMAIL = "E2E Auftragsbestätigung per E-Mail";
const SUBJECT_EDITED = "E2E Telefongespräch GEÄNDERT";

test.describe.serial("UC-CRM-02: Correspondence", () => {
  // ─── Pre-condition: Create address with contact ────────────────

  test("create address with contact for correspondence tests", async ({
    page,
  }) => {
    // Create address
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);

    await fillInput(page, "company", COMPANY);
    await fillInput(page, "city", "Hamburg");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY);

    // Navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Add contact
    await clickTab(page, "Kontakte");
    await page.getByRole("button", { name: "Kontakt hinzufügen" }).click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });

    await dialog.locator("#firstName").fill(CONTACT_FIRST);
    await dialog.locator("#lastName").fill(CONTACT_LAST);

    await dialog.getByRole("button", { name: /Anlegen|Speichern/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    await expect(
      page.getByText(`${CONTACT_FIRST} ${CONTACT_LAST}`),
    ).toBeVisible();
  });

  // ─── Log a phone call (incoming) ──────────────────────────────

  test("log a phone call (incoming)", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Go to Correspondence tab
    await clickTab(page, "Korrespondenz");

    // Click "Neuer Eintrag"
    await page.getByRole("button", { name: "Neuer Eintrag" }).click();
    await waitForSheet(page);

    // Fill the form
    await selectOption(page, "Richtung", "Eingehend");
    await selectOption(page, "Typ", "Telefon");

    // Select contact
    await selectOption(page, "Kontakt", `${CONTACT_FIRST} ${CONTACT_LAST}`);

    // Fill subject
    await fillInput(page, "corrSubject", SUBJECT_PHONE);

    // Fill content
    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.locator("#corrContent").fill("Besprechung des Liefertermins für Projekt XY");

    await submitAndWaitForClose(page);

    // Verify entry appears
    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible({ timeout: 10_000 });
  });

  // ─── Log an outgoing email ────────────────────────────────────

  test("log an outgoing email", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");

    await page.getByRole("button", { name: "Neuer Eintrag" }).click();
    await waitForSheet(page);

    await selectOption(page, "Richtung", "Ausgehend");
    await selectOption(page, "Typ", "E-Mail");

    await fillInput(page, "corrSubject", SUBJECT_EMAIL);

    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.locator("#corrContent").fill("Auftragsbestätigung für Projekt XY versendet");

    await submitAndWaitForClose(page);

    await expect(page.getByText(SUBJECT_EMAIL)).toBeVisible({ timeout: 10_000 });
  });

  // ─── Search correspondence ────────────────────────────────────

  test("search correspondence by subject", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");

    // Wait for entries to load
    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible({ timeout: 10_000 });

    // Search for phone subject
    const main = page.locator("main#main-content");
    await main.getByPlaceholder(/durchsuchen/i).fill("Liefertermin");
    await page.waitForTimeout(500);

    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible();
    // The email entry should not match "Liefertermin"
    await expect(page.getByText(SUBJECT_EMAIL)).not.toBeVisible();
  });

  // ─── Filter by direction ──────────────────────────────────────

  test("filter by direction", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");

    // Wait for entries to load
    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible({ timeout: 10_000 });

    // Clear search first
    const main = page.locator("main#main-content");
    const searchInput = main.getByPlaceholder(/durchsuchen/i);
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Filter to Eingehend only
    await page.locator("button").filter({ hasText: "Alle Richtungen" }).click();
    await page.getByRole("option", { name: "Eingehend", exact: true }).click();
    await page.waitForTimeout(500);

    // Phone call (incoming) should be visible, email (outgoing) should not
    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible();
    await expect(page.getByText(SUBJECT_EMAIL)).not.toBeVisible();

    // Reset filter
    await page.locator("button").filter({ hasText: "Eingehend" }).click();
    await page.getByRole("option", { name: "Alle Richtungen", exact: true }).click();
    await page.waitForTimeout(500);
  });

  // ─── View detail ──────────────────────────────────────────────

  test("view correspondence detail", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");

    // Wait for entries to load
    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible({ timeout: 10_000 });

    // Open actions menu for the phone entry
    const phoneRow = page
      .locator("table tbody tr")
      .filter({ hasText: SUBJECT_PHONE });
    await phoneRow.locator("button").filter({ hasText: "" }).last().click();

    // Click "Anzeigen"
    await page.getByRole("menuitem", { name: /Anzeigen/i }).click();

    // Verify detail dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await expect(dialog.getByText(SUBJECT_PHONE)).toBeVisible();
    await expect(dialog.getByText("Eingehend")).toBeVisible();

    // Close
    await dialog.getByRole("button", { name: /Schließen/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
  });

  // ─── Edit correspondence ──────────────────────────────────────

  test("edit correspondence entry", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");

    // Wait for entries to load
    await expect(page.getByText(SUBJECT_PHONE)).toBeVisible({ timeout: 10_000 });

    // Open actions menu for the phone entry
    const phoneRow = page
      .locator("table tbody tr")
      .filter({ hasText: SUBJECT_PHONE });
    await phoneRow.locator("button").filter({ hasText: "" }).last().click();

    // Click "Bearbeiten"
    await page.getByRole("menuitem", { name: /Bearbeiten/i }).click();
    await waitForSheet(page);

    // Modify subject
    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.locator("#corrSubject").clear();
    await sheet.locator("#corrSubject").fill(SUBJECT_EDITED);

    await submitAndWaitForClose(page);

    // Verify updated
    await expect(page.getByText(SUBJECT_EDITED)).toBeVisible({ timeout: 10_000 });
  });

  // ─── Delete correspondence ────────────────────────────────────

  test("delete correspondence entry", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");

    // Wait for the edited entry
    await expect(page.getByText(SUBJECT_EDITED)).toBeVisible({ timeout: 10_000 });

    // Open actions menu for the edited phone entry
    const editedRow = page
      .locator("table tbody tr")
      .filter({ hasText: SUBJECT_EDITED });
    await editedRow.locator("button").filter({ hasText: "" }).last().click();

    // Click "Löschen"
    await page.getByRole("menuitem", { name: /Löschen/i }).click();

    // Confirm dialog
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Entry should be gone
    await expect(page.getByText(SUBJECT_EDITED)).not.toBeVisible();
  });
});
