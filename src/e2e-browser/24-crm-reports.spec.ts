import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";

test.describe.serial("UC-CRM-05: CRM Reports", () => {
  test("navigate to CRM reports page", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify page title is visible
    await expect(
      page.getByText("CRM Auswertungen").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("view overview KPI cards", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify KPI cards are visible (by their label text)
    await expect(
      page.getByText("Adressen gesamt").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Offene Anfragen").first()
    ).toBeVisible();
    await expect(
      page.getByText("Offene Aufgaben").first()
    ).toBeVisible();
    await expect(
      page.getByText("Korrespondenz diese Woche").first()
    ).toBeVisible();
  });

  test("view address statistics tab", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Address stats is the default tab, verify content loads
    await expect(
      page.getByText("Adressen nach Typ").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Aktiv / Inaktiv").first()
    ).toBeVisible();
  });

  test("view correspondence chart tab", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on correspondence report tab
    await page.getByText("Korrespondenz-Bericht").first().click();
    await page.waitForTimeout(500);

    // Verify filter controls and chart labels are visible
    await expect(
      page.getByText("Korrespondenz im Zeitverlauf").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Korrespondenz nach Typ").first()
    ).toBeVisible();
  });

  test("view inquiry pipeline tab", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on inquiry pipeline tab
    await page.getByText("Anfragen-Pipeline").first().click();
    await page.waitForTimeout(500);

    // Verify pipeline content is visible
    await expect(
      page.getByText("Anfragen nach Status").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Top-Adressen nach Anfragen").first()
    ).toBeVisible();
  });

  test("view task completion report tab", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click on task completion tab
    await page.getByText("Aufgaben-Auswertung").first().click();
    await page.waitForTimeout(500);

    // Verify completion metrics are visible
    await expect(
      page.getByText("Erledigungsquote").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Aufgaben pro Mitarbeiter").first()
    ).toBeVisible();
  });

  test("reports page accessible from sidebar", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Click reports link in CRM sidebar section
    const crmSection = page.getByLabel("CRM");
    await crmSection.getByText("Auswertungen").click();

    // Verify navigation to reports page
    await expect(page).toHaveURL(/\/crm\/reports/);
    await expect(
      page.getByText("CRM Auswertungen").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
