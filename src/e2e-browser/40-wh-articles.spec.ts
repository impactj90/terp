import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  expectTableNotContains,
  openRowActions,
  clickMenuItem,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const ARTICLE_NAME = "E2E Testschraube M8x40";
const ARTICLE_NAME_2 = "E2E Unterlegscheibe M8";
const ARTICLE_SELL_PRICE = "4.50";
const GROUP_NAME = "E2E Befestigungsmaterial";
const GROUP_CHILD_NAME = "E2E Schrauben";
const SUPPLIER_COMPANY = "E2E Lieferant AG";

test.describe.serial("UC-WH-01: Article Management", () => {
  // ─── Pre-condition: Enable warehouse module ────────────────────

  test("enable warehouse module", async ({ page }) => {
    await navigateTo(page, "/admin/settings");

    const main = page.locator("main#main-content");
    await expect(main.getByText("Module", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const whSwitch = main.locator("#module-warehouse");
    await expect(whSwitch).toBeVisible();
    const isChecked = await whSwitch.getAttribute("aria-checked");
    if (isChecked !== "true") {
      await whSwitch.click();
      await page.waitForTimeout(1500);
    }

    // Verify articles link appears in sidebar
    const sidebar = page.locator("nav[aria-label='Main navigation']");
    await expect(
      sidebar.locator(`a[href="/warehouse/articles"]`),
    ).toBeVisible();
  });

  // ─── Navigate to articles ─────────────────────────────────────

  test("navigate to articles page", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await expectPageTitle(page, "Artikel");
  });

  // ─── Create article group hierarchy ───────────────────────────

  test("create article group hierarchy", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Create root group via the "+" button next to "Gruppen"
    const groupSection = page.locator("main#main-content");
    await groupSection
      .locator("button")
      .filter({ has: page.locator("svg.lucide-plus") })
      .first()
      .click();

    // Fill dialog
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.locator("input").fill(GROUP_NAME);
    await dialog.getByRole("button", { name: /Erstellen/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    // Verify group appears
    await expect(groupSection.getByText(GROUP_NAME)).toBeVisible();
  });

  // ─── Create an article ────────────────────────────────────────

  test("create an article", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");

    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    await waitForSheet(page);

    // Fill required fields
    await fillInput(page, "name", ARTICLE_NAME);
    await fillInput(page, "sellPrice", ARTICLE_SELL_PRICE);

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, ARTICLE_NAME);
  });

  // ─── Create second article (for BOM) ──────────────────────────

  test("create a second article for BOM", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");

    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    await waitForSheet(page);

    await fillInput(page, "name", ARTICLE_NAME_2);
    await fillInput(page, "sellPrice", "0.80");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, ARTICLE_NAME_2);
  });

  // ─── Search articles ──────────────────────────────────────────

  test("search articles by name", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await waitForTableLoad(page);

    await page
      .locator("main#main-content")
      .getByPlaceholder(/suche/i)
      .fill("Testschraube");
    await page.waitForTimeout(500);

    await expectTableContains(page, ARTICLE_NAME);
    await expectTableNotContains(page, ARTICLE_NAME_2);
  });

  // ─── Navigate to article detail ───────────────────────────────

  test("navigate to article detail page", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: ARTICLE_NAME });
    await row.click();

    await page.waitForURL("**/warehouse/articles/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify article name and number displayed in header
    await expect(
      page.locator("main#main-content").getByText(ARTICLE_NAME),
    ).toBeVisible();
  });

  // ─── Detail: Overview tab ─────────────────────────────────────

  test("detail page shows overview tab with article data", async ({
    page,
  }) => {
    await navigateTo(page, "/warehouse/articles");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: ARTICLE_NAME });
    await row.click();
    await page.waitForURL("**/warehouse/articles/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Overview tab should be active by default
    await expect(
      page.getByRole("tab", { name: "Uebersicht" }),
    ).toHaveAttribute("data-state", "active");

    // Verify article data is displayed
    const main = page.locator("main#main-content");
    await expect(main.getByText(ARTICLE_NAME)).toBeVisible();
    await expect(main.getByText("Stk")).toBeVisible();
  });

  // ─── Detail: Suppliers tab ────────────────────────────────────

  test("suppliers tab shows empty state", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: ARTICLE_NAME });
    await row.click();
    await page.waitForURL("**/warehouse/articles/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Lieferanten");
    await expect(
      page.getByText("Keine Lieferanten zugeordnet"),
    ).toBeVisible();
  });

  // ─── Detail: BOM tab ──────────────────────────────────────────

  test("BOM tab shows empty state", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await waitForTableLoad(page);

    const row = page
      .locator("table tbody tr")
      .filter({ hasText: ARTICLE_NAME });
    await row.click();
    await page.waitForURL("**/warehouse/articles/**");
    await page.locator("main#main-content").waitFor({ state: "visible" });

    await clickTab(page, "Stueckliste");
    await expect(
      page.getByText("Keine Komponenten in der Stueckliste"),
    ).toBeVisible();
  });

  // ─── Soft-delete and restore ──────────────────────────────────

  test("deactivate an article", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await waitForTableLoad(page);

    await openRowActions(page, ARTICLE_NAME_2);
    await clickMenuItem(page, /Deaktivieren/);

    // Confirm dialog
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: /Deaktivieren/i }).click();
    await page.waitForTimeout(1000);

    // Should disappear from active list
    await expectTableNotContains(page, ARTICLE_NAME_2);
  });

  test("restore an inactive article", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");

    // Toggle to show inactive articles
    const activeSwitch = page.locator("#activeFilter");
    await activeSwitch.click();
    await page.waitForTimeout(500);

    await expectTableContains(page, ARTICLE_NAME_2);

    // Restore via row action
    await openRowActions(page, ARTICLE_NAME_2);
    await clickMenuItem(page, /Wiederherstellen/);
    await page.waitForTimeout(1000);

    // Switch back to active and verify restored
    await activeSwitch.click();
    await page.waitForTimeout(500);

    await expectTableContains(page, ARTICLE_NAME_2);
  });
});
