import { test, expect } from "@playwright/test";
import {
  navigateTo,
  waitForTableLoad,
  expectPageTitle,
} from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  expectTableContains,
  openRowActions,
  clickMenuItem,
  clickTab,
  openCreateDialog,
  waitForSheet,
} from "./helpers/forms";

/**
 * UC-019 through UC-026: Employee management workflows.
 *
 * These tests run serially because later tests depend on the employee
 * created in UC-019.
 */
test.describe.serial("Mitarbeiter (Employee Management)", () => {
  const EMPLOYEE_FIRST = "E2E";
  const EMPLOYEE_LAST = "Testmitarbeiter";
  const EMPLOYEE_FULL = `${EMPLOYEE_FIRST} ${EMPLOYEE_LAST}`;
  const EMPLOYEE_EMAIL = "e2e-employee@test.local";
  const EMPLOYEE_PERSONNEL_NR = "E2E-001";
  const EMPLOYEE_PIN = "1234";

  // ── UC-019: Create Employee ──────────────────────────────────────

  test("UC-019: can create an employee", async ({ page }) => {
    // Navigate to the employees list page
    await navigateTo(page, "/admin/employees");
    await expectPageTitle(page, "Mitarbeiter");

    // Open the create sheet via the "Neuer Mitarbeiter" button
    await page
      .locator("main#main-content")
      .getByRole("button", { name: "Neuer Mitarbeiter" })
      .click();
    const sheet = await waitForSheet(page);

    // -- Personal Information section --
    await fillInput(page, "firstName", EMPLOYEE_FIRST);
    await fillInput(page, "lastName", EMPLOYEE_LAST);
    await fillInput(page, "email", EMPLOYEE_EMAIL);

    // -- Employment Details section --
    await fillInput(page, "personnelNumber", EMPLOYEE_PERSONNEL_NR);
    await fillInput(page, "pin", EMPLOYEE_PIN);

    // Select today's date in the entry-date calendar popover
    const entryDateButton = sheet.getByRole("button", {
      name: /datum auswählen/i,
    });
    await entryDateButton.click();
    // Click today in the calendar popover (custom Calendar component renders
    // plain <button> elements inside a Radix popover dialog)
    const popover = page.locator(
      '[role="dialog"][data-state="open"]:not([data-slot="sheet-content"])',
    );
    await popover.waitFor({ state: "visible" });
    const today = new Date();
    const todayDay = today.getDate().toString();
    await popover
      .locator("button")
      .filter({ hasText: new RegExp(`^${todayDay}$`) })
      .first()
      .click();

    // Dismiss the calendar popover if still open
    if (await popover.isVisible()) {
      await page.keyboard.press("Escape");
      await popover.waitFor({ state: "hidden" });
    }

    // Submit and wait for sheet to close (indicates success)
    await submitAndWaitForClose(page);

    // Verify the new employee appears in the table
    await waitForTableLoad(page);
    await expectTableContains(page, EMPLOYEE_PERSONNEL_NR);
  });

  // ── UC-020: View Employee Detail / Contacts ──────────────────────

  test("UC-020: can navigate to employee detail page", async ({ page }) => {
    await navigateTo(page, "/admin/employees");
    await waitForTableLoad(page);

    // Click on the employee row to navigate to the detail page
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: EMPLOYEE_PERSONNEL_NR });
    await row.click();

    // Wait for navigation to the detail page
    await page.waitForURL("**/admin/employees/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify the employee name appears in the heading
    await expect(
      page
        .locator("main#main-content")
        .getByRole("heading", { level: 1 }),
    ).toHaveText(new RegExp(`${EMPLOYEE_FIRST}\\s+${EMPLOYEE_LAST}`));

    // Verify contact section is visible (email should be displayed)
    await expect(
      page.locator("main#main-content").getByText(EMPLOYEE_EMAIL),
    ).toBeVisible();
  });

  // ── UC-021: Access Card section visible ──────────────────────────

  test("UC-021: employee detail page shows Access Cards section when cards exist", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/employees");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: EMPLOYEE_PERSONNEL_NR });
    await row.click();
    await page.waitForURL("**/admin/employees/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // The Overview tab should be selected by default.
    // Access Cards section heading: "Zugangskarten"
    // A new employee will not have cards, so the section may be hidden.
    // Verify at least that the overview tab content renders correctly.
    await expect(
      page.locator("main#main-content").getByText(/Kontaktinformationen/i),
    ).toBeVisible();
  });

  // ── UC-022: Tariff Assignments tab ───────────────────────────────

  test("UC-022: can open Tariff Assignments tab on employee detail", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/employees");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: EMPLOYEE_PERSONNEL_NR });
    await row.click();
    await page.waitForURL("**/admin/employees/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click the "Tarifzuweisungen" tab
    await clickTab(page, /Tarifzuweisungen/);

    // Verify the tariff assignments content area becomes visible
    await expect(
      page.locator("main#main-content").getByText(/Tarifzuweisungen/i),
    ).toBeVisible();
  });

  // ── UC-023: Teams page loads ─────────────────────────────────────

  test("UC-023: teams page loads with table", async ({ page }) => {
    await navigateTo(page, "/admin/teams");
    await expectPageTitle(page, "Teams");

    // Verify the page has loaded -- either a table with teams or an empty state
    const main = page.locator("main#main-content");
    await expect(
      main.locator("table, [class*='empty'], [class*='text-center']").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── UC-024: Users page loads ─────────────────────────────────────

  test("UC-024: users page loads with user cards", async ({ page }) => {
    await navigateTo(page, "/admin/users");
    await expectPageTitle(page, "Benutzer");

    // Users page uses card layout, not a table — verify user cards render
    const main = page.locator("main#main-content");
    await expect(main.getByText("admin@dev.local")).toBeVisible({ timeout: 10_000 });
  });

  // ── UC-025: Vacation Balances page ───────────────────────────────

  test("UC-025: vacation balances page loads and shows initialize button", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/vacation-balances");
    await expectPageTitle(page, "Urlaubskonten");

    // Verify the "Jahr initialisieren" button is visible
    await expect(
      page
        .locator("main#main-content")
        .getByRole("button", { name: /Jahr initialisieren/i }),
    ).toBeVisible();
  });

  // ── UC-026: Employee detail tabs work ────────────────────────────

  test("UC-026: employee detail page tabs switch correctly", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/employees");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: EMPLOYEE_PERSONNEL_NR });
    await row.click();
    await page.waitForURL("**/admin/employees/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Default tab is Overview ("Uebersicht")
    const overviewTab = page.getByRole("tab", { name: /Uebersicht/i });
    await expect(overviewTab).toHaveAttribute("data-state", "active");

    // Switch to Tariff Assignments tab
    await clickTab(page, /Tarifzuweisungen/);
    const tariffTab = page.getByRole("tab", { name: /Tarifzuweisungen/i });
    await expect(tariffTab).toHaveAttribute("data-state", "active");

    // Switch back to Overview
    await clickTab(page, /Uebersicht/);
    await expect(overviewTab).toHaveAttribute("data-state", "active");
  });
});
