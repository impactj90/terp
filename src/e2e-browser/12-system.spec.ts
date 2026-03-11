import { test, expect } from "@playwright/test";
import { navigateTo, expectPageTitle } from "./helpers/nav";

// ---------------------------------------------------------------------------
// UC-068: System Settings (/admin/settings)
// ---------------------------------------------------------------------------
test.describe("UC-068: System Settings", () => {
  test("navigate to settings page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/settings");
    await expectPageTitle(page, "Systemeinstellungen");
  });

  test("verify settings form loads with sections", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    // Calculation Settings section
    await expect(
      main.getByText("Berechnungseinstellungen"),
    ).toBeVisible({ timeout: 10_000 });

    // Order Settings section
    await expect(main.getByText("Auftragseinstellungen")).toBeVisible();
  });

  test("verify save settings button exists", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    await expect(
      page.getByRole("button", { name: "Einstellungen speichern" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("verify form toggles and inputs are visible", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    // Wait for settings form to load
    await expect(
      main.getByText("Berechnungseinstellungen"),
    ).toBeVisible({ timeout: 10_000 });

    // Switches should be visible (at least the ones in expanded sections)
    const switches = main.locator('button[role="switch"]');
    await expect(switches.first()).toBeVisible();

    // Number inputs should be visible (birthday days before/after)
    const numberInputs = main.locator('input[type="number"]');
    await expect(numberInputs.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-069: Audit Logs (/admin/audit-logs)
// ---------------------------------------------------------------------------
test.describe("UC-069: Audit Logs", () => {
  test("navigate to audit logs page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/audit-logs");
    await expectPageTitle(page, "Audit-Protokoll");
  });

  test("verify filters exist", async ({ page }) => {
    await navigateTo(page, "/admin/audit-logs");

    const main = page.locator("main#main-content");

    // Date range filter
    await expect(main.getByText("Zeitraum", { exact: true })).toBeVisible({ timeout: 10_000 });

    // User filter
    await expect(main.getByText("Benutzer", { exact: true })).toBeVisible();

    // Entity type filter
    await expect(main.getByText("Entitaetstyp", { exact: true })).toBeVisible();

    // Action filter
    await expect(main.getByText("Aktion", { exact: true })).toBeVisible();
  });

  test("verify log table area loads", async ({ page }) => {
    await navigateTo(page, "/admin/audit-logs");

    const main = page.locator("main#main-content");

    // Wait for the page to finish loading - result count shows total (e.g. "0 Ergebnisse")
    await expect(
      main.getByText(/\d+ Ergebnis/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("verify table columns", async ({ page }) => {
    await navigateTo(page, "/admin/audit-logs");

    const main = page.locator("main#main-content");

    // Wait for page to load (filters act as column headers)
    await expect(main.getByText("Zeitraum", { exact: true })).toBeVisible({ timeout: 10_000 });

    // The audit log page uses filter labels as column headers above the data area.
    // Verify all expected column filter labels are present.
    await expect(main.getByText("Benutzer", { exact: true })).toBeVisible();
    await expect(main.getByText("Aktion", { exact: true })).toBeVisible();
    await expect(main.getByText("Entitaetstyp", { exact: true })).toBeVisible();
    await expect(main.getByText("Entitaets-ID", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-070: Data Cleanup (/admin/settings - bottom section)
// ---------------------------------------------------------------------------
test.describe("UC-070: Data Cleanup", () => {
  test("verify cleanup tools section exists below settings", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    // Wait for page to load
    await expect(
      main.getByText("Berechnungseinstellungen"),
    ).toBeVisible({ timeout: 10_000 });

    // Separator exists between settings and cleanup
    await expect(main.locator("hr")).toBeVisible();

    // Cleanup tools heading
    await expect(main.getByText("Bereinigungswerkzeuge")).toBeVisible();
  });

  test("verify destructive warning is displayed", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    // Wait for cleanup section to load
    await expect(
      main.getByText("Bereinigungswerkzeuge"),
    ).toBeVisible({ timeout: 10_000 });

    // Destructive warning alert
    await expect(
      main.getByText(/destruktiv.*rueckgaengig/i),
    ).toBeVisible();
  });

  test("verify Delete Bookings cleanup tool exists", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    await expect(
      main.getByText("Bereinigungswerkzeuge"),
    ).toBeVisible({ timeout: 10_000 });

    // "Buchungen loeschen" card with destructive button
    await expect(
      main.getByRole("button", { name: "Buchungen loeschen" }),
    ).toBeVisible();
  });

  test("verify Delete Booking Data cleanup tool exists", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    await expect(
      main.getByText("Bereinigungswerkzeuge"),
    ).toBeVisible({ timeout: 10_000 });

    // "Buchungsdaten loeschen" card with destructive button
    await expect(
      main.getByRole("button", { name: "Buchungsdaten loeschen" }),
    ).toBeVisible();
  });

  test("verify Re-Read Bookings cleanup tool exists", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    await expect(
      main.getByText("Bereinigungswerkzeuge"),
    ).toBeVisible({ timeout: 10_000 });

    // "Buchungen neu einlesen" card with destructive button
    await expect(
      main.getByRole("button", { name: "Buchungen neu einlesen" }),
    ).toBeVisible();
  });

  test("verify Mark & Delete Orders cleanup tool exists", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");

    await expect(
      main.getByText("Bereinigungswerkzeuge"),
    ).toBeVisible({ timeout: 10_000 });

    // "Auftraege markieren & loeschen" card with destructive button
    await expect(
      main.getByRole("button", {
        name: "Auftraege markieren & loeschen",
      }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-004: Logout (MUST BE LAST — signOut invalidates server-side session)
// ---------------------------------------------------------------------------
test.describe("UC-004: Logout", () => {
  test("logout and verify redirect to login", async ({ page }) => {
    await navigateTo(page, "/dashboard");

    // Open user menu and click logout
    await page
      .getByRole("button", { name: /open user menu|Benutzermenü öffnen/i })
      .click();
    await page.getByRole("menuitem", { name: /Sign out|Abmelden/i }).click();

    // Verify redirect to login page
    await page.waitForURL("**/login", { timeout: 10_000 });
    await expect(page.locator("#email")).toBeVisible();
  });
});
