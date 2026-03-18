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
const COMPANY = "E2E Vorgang GmbH";
const CONTACT_FIRST = "E2E Maria";
const CONTACT_LAST = "E2E Huber";
const INQUIRY_TITLE = "E2E Grossprojekt Frasteile";
const INQUIRY_TITLE_2 = "E2E Anfrage Schaltschraenke";

test.describe.serial("UC-CRM-03: Inquiries", () => {
  // --- Pre-condition: Create address with contact ---

  test("create address with contact for inquiry tests", async ({ page }) => {
    // Create address
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);

    await fillInput(page, "company", COMPANY);
    await fillInput(page, "city", "Stuttgart");

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

  // --- Create inquiry from address detail tab ---

  test("create an inquiry from address detail tab", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Go to Anfragen tab
    await clickTab(page, "Anfragen");

    // Click "Neue Anfrage"
    await page.getByRole("button", { name: "Neue Anfrage" }).click();
    await waitForSheet(page);

    // Fill the form
    await fillInput(page, "inqTitle", INQUIRY_TITLE);
    await selectOption(page, "Kontakt", `${CONTACT_FIRST} ${CONTACT_LAST}`);
    await selectOption(page, "Aufwand", "Hoch");

    await submitAndWaitForClose(page);

    // Verify entry appears with auto-generated number
    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });
    // Verify status badge shows "Offen"
    await expect(page.getByText("Offen", { exact: true })).toBeVisible();
  });

  // --- Create a second inquiry from global page ---

  test("create a second inquiry from global page", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Neue Anfrage" }).click();
    await waitForSheet(page);

    // Select address
    await selectOption(page, "Kunde / Lieferant", COMPANY);
    await fillInput(page, "inqTitle", INQUIRY_TITLE_2);
    await selectOption(page, "Aufwand", "Mittel");

    await submitAndWaitForClose(page);

    // Verify entry appears in global list
    await expect(page.getByText(INQUIRY_TITLE_2)).toBeVisible({ timeout: 10_000 });
  });

  // --- Search inquiries ---

  test("search inquiries by title", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Wait for entries to load
    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });

    // Search
    const main = page.locator("main#main-content");
    await main.getByPlaceholder(/durchsuchen/i).fill("Grossprojekt");
    await page.waitForTimeout(500);

    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible();
    await expect(page.getByText(INQUIRY_TITLE_2)).not.toBeVisible();

    // Clear search
    await main.getByPlaceholder(/durchsuchen/i).clear();
    await page.waitForTimeout(500);
  });

  // --- Filter by status ---

  test("filter inquiries by status", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Wait for entries to load
    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });

    // Filter to "Offen"
    await page.locator("button").filter({ hasText: "Alle Status" }).click();
    await page.getByRole("option", { name: "Offen", exact: true }).click();
    await page.waitForTimeout(500);

    // Both E2E inquiries should be shown (both are OPEN)
    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible();
    await expect(page.getByText(INQUIRY_TITLE_2)).toBeVisible();

    // Filter to "Geschlossen"
    await page.locator("button").filter({ hasText: "Offen" }).click();
    await page.getByRole("option", { name: "Geschlossen", exact: true }).click();
    await page.waitForTimeout(500);

    // No E2E inquiries should be shown
    await expect(page.getByText(INQUIRY_TITLE)).not.toBeVisible();
    await expect(page.getByText(INQUIRY_TITLE_2)).not.toBeVisible();

    // Reset filter
    await page.locator("button").filter({ hasText: "Geschlossen" }).click();
    await page.getByRole("option", { name: "Alle Status", exact: true }).click();
    await page.waitForTimeout(500);
  });

  // --- Navigate to detail ---

  test("navigate to inquiry detail", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Wait for entries to load
    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });

    // Click on the row to navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: INQUIRY_TITLE });
    await row.click();
    await page.waitForURL("**/crm/inquiries/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Wait for detail page data to load
    await page.waitForResponse((r) => r.url().includes("crm.inquiries.getById") && r.ok(), { timeout: 10_000 });

    // Verify detail page content
    await expect(page.locator("h1").filter({ hasText: INQUIRY_TITLE })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Offen").first()).toBeVisible();
    await expect(page.getByText(COMPANY)).toBeVisible();
  });

  // --- Edit inquiry ---

  test("edit inquiry details", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });

    // Navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: INQUIRY_TITLE });
    await row.click();
    await page.waitForURL("**/crm/inquiries/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click Edit
    await page.getByRole("button", { name: /Bearbeiten/i }).click();
    await waitForSheet(page);

    // Modify notes field
    const sheet = page.locator('[data-state="open"][role="dialog"]');
    await sheet.locator("#inqNotes").fill("E2E Updated Notes");

    await submitAndWaitForClose(page);

    // Verify status transitions to "In Bearbeitung"
    await expect(page.getByText("In Bearbeitung").first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Close inquiry ---

  test("close inquiry with reason", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });

    // Navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: INQUIRY_TITLE });
    await row.click();
    await page.waitForURL("**/crm/inquiries/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click "Schliessen"
    await page.getByRole("button", { name: /Schließen/i, exact: false }).first().click();

    // Fill close dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });

    await selectOption(page, "Abschlussgrund", "Auftrag erteilt");
    await dialog.locator("#closingRemarks").fill("E2E Testabschluss");

    await dialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify status badge shows "Geschlossen"
    await expect(page.getByText("Geschlossen").first()).toBeVisible({ timeout: 10_000 });

    // Verify immutable notice
    await expect(page.getByText(/geschlossen und kann nicht mehr bearbeitet/i)).toBeVisible();
  });

  // --- Reopen closed inquiry ---

  test("reopen closed inquiry", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });

    // Navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: INQUIRY_TITLE });
    await row.click();
    await page.waitForURL("**/crm/inquiries/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click "Wieder öffnen"
    await page.getByRole("button", { name: /Wieder öffnen/i }).click();

    // Confirm dialog
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify status changes to "In Bearbeitung"
    await expect(page.getByText("In Bearbeitung").first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Cancel second inquiry ---

  test("cancel second inquiry", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(INQUIRY_TITLE_2)).toBeVisible({ timeout: 10_000 });

    // Navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: INQUIRY_TITLE_2 });
    await row.click();
    await page.waitForURL("**/crm/inquiries/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click "Abbrechen" (cancel inquiry button, not the generic cancel)
    // The cancel button has the X icon
    await page.getByRole("button", { name: /Abbrechen/i }).first().click();

    // Confirm dialog
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify status badge shows "Storniert"
    await expect(page.getByText("Storniert").first()).toBeVisible({ timeout: 10_000 });
  });

  // --- Delete cancelled inquiry ---

  test("delete cancelled inquiry", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(page.getByText(INQUIRY_TITLE_2)).toBeVisible({ timeout: 10_000 });

    // Navigate to detail
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: INQUIRY_TITLE_2 });
    await row.click();
    await page.waitForURL("**/crm/inquiries/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click "Löschen"
    await page.getByRole("button", { name: /Löschen/i }).click();

    // Confirm deletion
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Verify redirected to list
    await page.waitForURL("**/crm/inquiries");
    // Entry should be removed
    await expect(page.getByText(INQUIRY_TITLE_2)).not.toBeVisible();
  });
});
