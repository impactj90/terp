import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  expectTableNotContains,
  openRowActions,
  clickMenuItem,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const COMPANY_CUSTOMER = "E2E Kunde GmbH";
const COMPANY_SUPPLIER = "E2E Lieferant AG";
const CONTACT_FIRST = "E2E Max";
const CONTACT_LAST = "E2E Mustermann";
const BANK_IBAN = "DE89370400440532013000";

test.describe.serial("UC-CRM-01: Address Management", () => {
  // ─── Pre-condition: Enable CRM module ───────────────────────────

  test("enable CRM module", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");
    await expect(main.getByText("Module", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const crmSwitch = main.locator("#module-crm");
    await expect(crmSwitch).toBeVisible();
    const isChecked = await crmSwitch.getAttribute("aria-checked");
    if (isChecked !== "true") {
      await crmSwitch.click();
      await page.waitForTimeout(1500);
    }

    // Verify CRM addresses link appears in sidebar
    const sidebar = page.locator("nav[aria-label='Main navigation']");
    await expect(sidebar.locator(`a[href="/crm/addresses"]`)).toBeVisible();
  });

  // ─── Navigate to addresses ──────────────────────────────────────

  test("navigate to CRM addresses page", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await expectPageTitle(page, "Adressverwaltung");
  });

  // ─── Create customer address ────────────────────────────────────

  test("create a customer address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");

    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);

    // Basic info
    await fillInput(page, "company", COMPANY_CUSTOMER);
    await fillInput(page, "matchCode", "E2EKUNDE");

    // Address
    await fillInput(page, "street", "Teststraße 1");
    await fillInput(page, "zip", "10115");
    await fillInput(page, "city", "Berlin");

    // Communication
    await fillInput(page, "phone", "+49 30 123456");
    await fillInput(page, "email", "info@e2e-kunde.de");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY_CUSTOMER);
  });

  // ─── Create supplier address ────────────────────────────────────

  test("create a supplier address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");

    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);

    await selectOption(page, "Typ", "Lieferant");
    await fillInput(page, "company", COMPANY_SUPPLIER);
    await fillInput(page, "city", "München");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY_SUPPLIER);
  });

  // ─── Search addresses ───────────────────────────────────────────

  test("search addresses by company name", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    await page.locator("main#main-content").getByPlaceholder(/suchen/i).fill("Kunde");
    await page.waitForTimeout(500);

    await expectTableContains(page, COMPANY_CUSTOMER);
    await expectTableNotContains(page, COMPANY_SUPPLIER);
  });

  // ─── Filter by type ─────────────────────────────────────────────

  test("filter addresses by type", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    // Filter to supplier only
    await page.locator("button").filter({ hasText: "Alle Typen" }).click();
    await page.getByRole("option", { name: "Lieferant", exact: true }).click();
    await page.waitForTimeout(500);

    await expectTableContains(page, COMPANY_SUPPLIER);
    await expectTableNotContains(page, COMPANY_CUSTOMER);
  });

  // ─── View address detail ────────────────────────────────────────

  test("navigate to address detail page", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY_CUSTOMER });
    await row.click();

    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await expect(
      page
        .locator("main#main-content")
        .getByRole("heading", { level: 1 }),
    ).toHaveText(COMPANY_CUSTOMER);
  });

  // ─── Detail: Overview tab ───────────────────────────────────────

  test("detail page shows overview tab with address data", async ({
    page,
  }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY_CUSTOMER });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Overview tab should be active by default
    await expect(page.getByRole("tab", { name: "Übersicht" })).toHaveAttribute(
      "data-state",
      "active",
    );

    // Verify address data is displayed
    const main = page.locator("main#main-content");
    await expect(main.getByText("Teststraße 1")).toBeVisible();
    await expect(main.getByText("Berlin")).toBeVisible();
  });

  // ─── Detail: Add contact ───────────────────────────────────────

  test("add a contact to the address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY_CUSTOMER });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Switch to Contacts tab
    await clickTab(page, "Kontakte");

    // Click Add Contact
    await page.getByRole("button", { name: "Kontakt hinzufügen" }).click();

    // Fill dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });

    await dialog.locator("#firstName").fill(CONTACT_FIRST);
    await dialog.locator("#lastName").fill(CONTACT_LAST);
    await dialog.locator("#contactEmail").fill("max@e2e-kunde.de");

    await dialog.getByRole("button", { name: /Anlegen|Speichern/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    // Verify contact appears in list
    await expect(
      page.getByText(`${CONTACT_FIRST} ${CONTACT_LAST}`),
    ).toBeVisible();
  });

  // ─── Detail: Add bank account ──────────────────────────────────

  test("add a bank account to the address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY_CUSTOMER });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Switch to Bank Accounts tab
    await clickTab(page, "Bankverbindungen");

    // Click Add Bank Account
    await page
      .getByRole("button", { name: "Bankverbindung hinzufügen" })
      .click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });

    await dialog.locator("#iban").fill(BANK_IBAN);
    await dialog.locator("#bankName").fill("Commerzbank");

    await dialog.getByRole("button", { name: /Anlegen|Speichern/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    // Verify bank account appears
    await expect(page.getByText(BANK_IBAN)).toBeVisible();
  });

  // ─── Placeholder tabs ──────────────────────────────────────────

  test("placeholder tabs show coming soon message", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: COMPANY_CUSTOMER });
    await row.click();
    await page.waitForURL("**/crm/addresses/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Korrespondenz");
    await expect(page.getByText("In Vorbereitung")).toBeVisible();

    await clickTab(page, "Anfragen");
    await expect(page.getByText("In Vorbereitung")).toBeVisible();

    await clickTab(page, "Belege");
    await expect(page.getByText("In Vorbereitung")).toBeVisible();
  });

  // ─── Soft-delete and restore ───────────────────────────────────

  test("deactivate an address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await waitForTableLoad(page);

    await openRowActions(page, COMPANY_SUPPLIER);
    await clickMenuItem(page, /Deaktivieren/);

    // Confirm dialog
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: /Bestätigen/i }).click();
    await page.waitForTimeout(1000);

    // Should disappear from active list
    await expectTableNotContains(page, COMPANY_SUPPLIER);
  });

  test("restore an inactive address", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");

    // Switch to show inactive
    await page.locator("button").filter({ hasText: "Aktiv" }).click();
    await page.getByRole("option", { name: "Inaktiv" }).click();
    await page.waitForTimeout(500);

    await expectTableContains(page, COMPANY_SUPPLIER);

    // Restore via row action
    await openRowActions(page, COMPANY_SUPPLIER);
    await clickMenuItem(page, /Wiederherstellen/);
    await page.waitForTimeout(1000);

    // Switch back to active and verify restored
    await page.locator("button").filter({ hasText: "Inaktiv" }).click();
    await page.getByRole("option", { name: "Aktiv", exact: true }).click();
    await page.waitForTimeout(500);

    await expectTableContains(page, COMPANY_SUPPLIER);
  });
});
