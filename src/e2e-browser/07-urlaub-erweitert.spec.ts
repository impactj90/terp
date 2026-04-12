import { test, expect } from "@playwright/test";
import { navigateTo, expectPageTitle } from "./helpers/nav";
import { clickTab } from "./helpers/forms";

const VACATION_CONFIG_PATH = "/admin/vacation-config";
const PAGE_TITLE = "Urlaubskonfiguration";

// ---------------------------------------------------------------------------
// UC-046: Special Calculations
// ---------------------------------------------------------------------------
test.describe.serial("UC-046: Special Calculations", () => {
  test("navigate to vacation config and verify title", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await expectPageTitle(page, PAGE_TITLE);
  });

  test("has all 6 tabs", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);

    const tabNames = [
      "Sonderberechnungen",
      "Berechnungsgruppen",
      "Kappungsregeln",
      "Kappungsregelgruppen",
      "Mitarbeiterausnahmen",
      "Vorschau",
    ];

    for (const name of tabNames) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }
  });

  test("Sonderberechnungen tab is active by default", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);

    await expect(
      page.getByRole("tab", { name: "Sonderberechnungen" }),
    ).toHaveAttribute("data-state", "active");
  });

  test("Sonderberechnungen tab content loads", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);

    // Verify content loads: either a table or an empty state message
    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel).toBeVisible();
    await expect(
      tabPanel.locator("table, [data-empty-state]").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create button exists on Sonderberechnungen", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);

    const main = page.locator("main#main-content");
    const createButton = main.getByRole("button").filter({
      has: page.locator('svg[class*="lucide-plus"]'),
    });
    await expect(createButton.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-047: Calculation Groups
// ---------------------------------------------------------------------------
test.describe.serial("UC-047: Calculation Groups", () => {
  test("click Berechnungsgruppen tab and verify content loads", async ({
    page,
  }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await clickTab(page, "Berechnungsgruppen");

    await expect(
      page.getByRole("tab", { name: "Berechnungsgruppen" }),
    ).toHaveAttribute("data-state", "active");

    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel).toBeVisible();
    await expect(
      tabPanel.locator("table, [data-empty-state]").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create button exists on Berechnungsgruppen", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await clickTab(page, "Berechnungsgruppen");

    const main = page.locator("main#main-content");
    const createButton = main.getByRole("button").filter({
      has: page.locator('svg[class*="lucide-plus"]'),
    });
    await expect(createButton.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-048: Capping Rules
// ---------------------------------------------------------------------------
test.describe.serial("UC-048: Capping Rules", () => {
  test("click Kappungsregeln tab and verify content loads", async ({
    page,
  }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await clickTab(page, "Kappungsregeln");

    await expect(
      page.getByRole("tab", { name: "Kappungsregeln" }),
    ).toHaveAttribute("data-state", "active");

    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel).toBeVisible();
    await expect(
      tabPanel.locator("table, [data-empty-state]").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create button exists on Kappungsregeln", async ({ page }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await clickTab(page, "Kappungsregeln");

    const main = page.locator("main#main-content");
    const createButton = main.getByRole("button").filter({
      has: page.locator('svg[class*="lucide-plus"]'),
    });
    await expect(createButton.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-049: Employee Exceptions
// ---------------------------------------------------------------------------
test.describe.serial("UC-049: Employee Exceptions", () => {
  test("click Mitarbeiterausnahmen tab and verify content loads", async ({
    page,
  }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await clickTab(page, "Mitarbeiterausnahmen");

    await expect(
      page.getByRole("tab", { name: "Mitarbeiterausnahmen" }),
    ).toHaveAttribute("data-state", "active");

    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel).toBeVisible();
    await expect(
      tabPanel.locator("table, [data-empty-state]").first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// UC-050: Carryover Preview
// ---------------------------------------------------------------------------
test.describe.serial("UC-050: Carryover Preview", () => {
  test("click Vorschau tab and verify preview content loads", async ({
    page,
  }) => {
    await navigateTo(page, VACATION_CONFIG_PATH);
    await clickTab(page, "Vorschau");

    await expect(
      page.getByRole("tab", { name: "Vorschau" }),
    ).toHaveAttribute("data-state", "active");

    // Preview tab may show a year selector, generate button, or results table
    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel).toBeVisible();
    await expect(
      tabPanel
        .locator(
          'table, [data-empty-state], button, select, input[type="number"]',
        )
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
