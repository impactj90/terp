import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// ---------------------------------------------------------------------------
// UC-017: Departments
// ---------------------------------------------------------------------------
test.describe.serial("UC-017: Departments", () => {
  test("navigate to departments page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/departments");
    await expectPageTitle(page, "Abteilungen");
  });

  test("has tree and list view tabs", async ({ page }) => {
    await navigateTo(page, "/admin/departments");

    const treeTab = page.getByRole("tab", { name: "Baum" });
    const listTab = page.getByRole("tab", { name: "Liste" });

    await expect(treeTab).toBeVisible();
    await expect(listTab).toBeVisible();

    // Default view is tree
    await expect(treeTab).toHaveAttribute("data-state", "active");
  });

  test("create a root department", async ({ page }) => {
    await navigateTo(page, "/admin/departments");

    // Click create button
    await page.getByRole("button", { name: "Neue Abteilung" }).click();

    // Wait for sheet to open
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    // Fill in the form
    await fillInput(page, "name", "E2E Abteilung");
    await fillInput(page, "code", "E2E-DEPT");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Switch to list view to verify in table
    await clickTab(page, "Liste");
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Abteilung");
  });

  test("create a child department under the root department", async ({
    page,
  }) => {
    await navigateTo(page, "/admin/departments");

    // Click create button
    await page.getByRole("button", { name: "Neue Abteilung" }).click();

    // Wait for sheet to open
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    // Fill in the form
    await fillInput(page, "name", "E2E Unterabteilung");
    await fillInput(page, "code", "E2E-SUBDEPT");

    // Select parent department
    await selectOption(
      page,
      "Übergeordnete Abteilung",
      /E2E Abteilung/,
    );

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Switch to list view to verify in table
    await clickTab(page, "Liste");
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Unterabteilung");
  });
});

// ---------------------------------------------------------------------------
// UC-018: Teams
// ---------------------------------------------------------------------------
test.describe.serial("UC-018: Teams", () => {
  test("navigate to teams page and verify title", async ({ page }) => {
    await navigateTo(page, "/admin/teams");
    await expectPageTitle(page, "Teams");
  });

  test("has a department filter", async ({ page }) => {
    await navigateTo(page, "/admin/teams");

    // The department filter select shows "Alle Abteilungen" by default
    await expect(page.getByText("Alle Abteilungen")).toBeVisible();
  });

  test("create a team", async ({ page }) => {
    await navigateTo(page, "/admin/teams");

    // Click create button
    await page.getByRole("button", { name: "Neues Team" }).click();

    // Wait for sheet to open
    await page
      .locator('[data-slot="sheet-content"][data-state="open"]')
      .waitFor({ state: "visible" });

    // Fill in the form
    await fillInput(page, "name", "E2E Team");

    // Submit and wait for close
    await submitAndWaitForClose(page);

    // Verify team appears in table
    await waitForTableLoad(page);
    await expectTableContains(page, "E2E Team");
  });
});
