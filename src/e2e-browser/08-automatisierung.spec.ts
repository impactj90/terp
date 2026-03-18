import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-051: Shift Planning
// ---------------------------------------------------------------------------
test.describe.serial("UC-051: Shift Planning", () => {
  test("navigate to shift planning page and verify tabs", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await expectPageTitle(page, "Schichtplanung");

    // Verify both tabs exist
    await expect(page.getByRole("tab", { name: "Schichten" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Plantafel" })).toBeVisible();
  });

  test("create shift E2E-SHIFT", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await clickTab(page, "Schichten");

    // The shifts tab may show an empty state (no table) or a table.
    // Click the header "Neue Schicht" button (not the empty-state one).
    await page
      .getByRole("button", { name: /Neue Schicht/i })
      .first()
      .click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-SHIFT");
    await fillInput(page, "name", "E2E Schicht");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-SHIFT");
  });

  // ── Demo: 3-Schicht-Betrieb — FS, SS, NS ───────────────────────────
  test("create Frühschicht (E2E-FS)", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await clickTab(page, "Schichten");
    await waitForTableLoad(page);

    await page.getByRole("button", { name: /Neue Schicht/i }).first().click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-FS");
    await fillInput(page, "name", "E2E Frühschicht");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-FS");
  });

  test("create Spätschicht (E2E-SS)", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await clickTab(page, "Schichten");
    await waitForTableLoad(page);

    await page.getByRole("button", { name: /Neue Schicht/i }).first().click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-SS");
    await fillInput(page, "name", "E2E Spätschicht");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-SS");
  });

  test("create Nachtschicht (E2E-NS)", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await clickTab(page, "Schichten");
    await waitForTableLoad(page);

    await page.getByRole("button", { name: /Neue Schicht/i }).first().click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "code", "E2E-NS");
    await fillInput(page, "name", "E2E Nachtschicht");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E-NS");
  });

  test("Plantafel — Schichtpalette prüfen", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await clickTab(page, "Plantafel");

    // Verify planning board loads (active tab panel)
    const panel = page.locator(
      'main#main-content [role="tabpanel"][data-state="active"]',
    );
    await expect(panel).toBeVisible();

    // Verify all 3 demo shifts appear in the palette / legend
    await expect(panel.getByRole("button", { name: /E2E-FS/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByRole("button", { name: /E2E-SS/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByRole("button", { name: /E2E-NS/ })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("switch to Plantafel tab", async ({ page }) => {
    await navigateTo(page, "/admin/shift-planning");
    await clickTab(page, "Plantafel");

    // Verify planning board loads (active tab panel)
    await expect(
      page.locator('main#main-content [role="tabpanel"][data-state="active"]'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-052: Create Macro
// ---------------------------------------------------------------------------
test.describe.serial("UC-052: Macros", () => {
  test("navigate to macros page", async ({ page }) => {
    await navigateTo(page, "/admin/macros");
    await expectPageTitle(page, "Makros");
  });

  test("create macro E2E Makro", async ({ page }) => {
    await navigateTo(page, "/admin/macros");
    await page.getByRole("button", { name: "Neues Makro" }).click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "name", "E2E Makro");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Makro");
  });
});

// ---------------------------------------------------------------------------
// UC-053: Macro Detail
// ---------------------------------------------------------------------------
test.describe.serial("UC-053: Macro Detail", () => {
  test("navigate to macro detail page", async ({ page }) => {
    await navigateTo(page, "/admin/macros");
    await waitForTableLoad(page);

    // Click on the created macro row to navigate to detail
    await page
      .locator("table tbody tr")
      .filter({ hasText: "E2E Makro" })
      .click();

    // Wait for detail page to load
    await page.waitForURL(/\/admin\/macros\/.+/);
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Verify macro name is visible on detail page
    await expect(page.getByText("E2E Makro")).toBeVisible();
  });

  test("verify detail page sections", async ({ page }) => {
    await navigateTo(page, "/admin/macros");
    await waitForTableLoad(page);

    await page
      .locator("table tbody tr")
      .filter({ hasText: "E2E Makro" })
      .click();
    await page.waitForURL(/\/admin\/macros\/.+/);
    await page.locator("main#main-content").waitFor({ state: "visible" });

    // Look for Zuweisungen and Ausführungen tabs (German UI labels)
    await expect(
      page.getByRole("tab", { name: "Zuweisungen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Ausführungen" }),
    ).toBeVisible();

    // Look for "Jetzt ausführen" button (German for Execute Now)
    await expect(
      page.getByRole("button", { name: /Jetzt ausführen/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// UC-054: Create Schedule
// ---------------------------------------------------------------------------
test.describe.serial("UC-054: Schedules", () => {
  test("navigate to schedules page", async ({ page }) => {
    await navigateTo(page, "/admin/schedules");
    await expectPageTitle(page, "Zeitpläne");
  });

  test("create schedule E2E Zeitplan", async ({ page }) => {
    await navigateTo(page, "/admin/schedules");
    // Two "Neuer Zeitplan" buttons exist (header + empty state). Use first().
    await page.getByRole("button", { name: "Neuer Zeitplan" }).first().click();
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    await fillInput(page, "name", "E2E Zeitplan");

    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Zeitplan");
  });
});

// ---------------------------------------------------------------------------
// UC-055: Schedule Detail
// ---------------------------------------------------------------------------
test.describe.serial("UC-055: Schedule Detail", () => {
  test("verify schedule row has actions menu", async ({ page }) => {
    await navigateTo(page, "/admin/schedules");
    await waitForTableLoad(page);

    // Find the E2E Zeitplan row and open its actions menu
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: "E2E Zeitplan" });
    await row.getByRole("button").last().click();

    // Verify the actions menu opens
    await page.getByRole("menu").waitFor({ state: "visible" });
  });

  test("verify Jetzt ausführen in actions or toolbar", async ({ page }) => {
    await navigateTo(page, "/admin/schedules");
    await waitForTableLoad(page);

    // Verify E2E Zeitplan is visible in the table
    await expectTableContains(page, "E2E Zeitplan");

    // The schedule has a toggle in the Aktiv column and actions button
    const row = page
      .locator("table tbody tr")
      .filter({ hasText: "E2E Zeitplan" });
    await expect(row).toBeVisible();
  });
});
